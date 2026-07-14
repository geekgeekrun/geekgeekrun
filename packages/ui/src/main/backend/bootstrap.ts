import fs from 'node:fs/promises'
import path from 'node:path'
import { installLaunchdSupervisor } from '@geekgeekrun/ggrd/lib/launchd.mjs'
import { connectBackend } from './client'
import { getSupervisorClient, getSupervisorSocketPath, installBackendUpdate } from './supervisor-client'

const BOOTSTRAP_VERSION = '1.0.0'

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const isDevelopment = () => process.env.NODE_ENV === 'development'

function configuredHttpsProxy(): string | undefined {
  const value = process.env.GGR_HTTPS_PROXY
  if (!value) return undefined
  const proxy = new URL(value)
  if (proxy.protocol !== 'https:') throw new Error('Configured backend proxy must use HTTPS')
  return proxy.href
}

function packagedBootstrapDirectory(): string {
  return path.join(process.resourcesPath, 'ggrd-bootstrap')
}

export async function ensureSupervisorInstalled(): Promise<void> {
  if (isDevelopment()) return
  const bootstrapSource = packagedBootstrapDirectory()
  const server = path.join(bootstrapSource, 'server.mjs')
  await fs.access(server)
  await installLaunchdSupervisor({
    bootstrapSource,
    bootstrapVersion: BOOTSTRAP_VERSION,
    httpsProxy: configuredHttpsProxy()
  })
}

async function waitForSupervisor() {
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const supervisor = getSupervisorClient()
      if (!supervisor.connected) await supervisor.connect()
      return supervisor
    } catch (error) {
      lastError = error
      await sleep(250)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Supervisor did not become ready')
}

async function waitForBackend() {
  let lastError: unknown
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return await connectBackend()
    } catch (error) {
      lastError = error
      await sleep(250)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Backend did not become ready')
}

export async function ensureBackendReady(): Promise<void> {
  if (isDevelopment()) {
    try {
      await connectBackend()
      return
    } catch (error) {
      throw new Error(`Development backend is unavailable. Run pnpm dev:backend and set GGR_BACKEND_SOCKET if needed. ${error instanceof Error ? error.message : ''}`)
    }
  }
  const supervisor = await waitForSupervisor()
  const status = await supervisor.request('supervisor.status') as { current?: string | null }
  if (!status.current) await installBackendUpdate()
  await waitForBackend()
}

export { getSupervisorSocketPath }
