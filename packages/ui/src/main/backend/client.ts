import { app } from 'electron'
import path from 'node:path'
import { createGgrClient } from '@geekgeekrun/ggr-client'
import type { SystemHealthResult } from '@geekgeekrun/ggr-protocol'

export type BackendClient = ReturnType<typeof createGgrClient>

let client: BackendClient | undefined
const connectedListeners = new Set<(backend: BackendClient) => void>()

function notifyConnected(backend: BackendClient): void {
  for (const listener of connectedListeners) {
    try {
      listener(backend)
    } catch {
      // A UI listener must not make a successful backend connection fail.
    }
  }
}

export function getBackendSocketPath(): string {
  return process.env.GGR_BACKEND_SOCKET ?? path.join(app.getPath('home'), '.geekgeekrun', 'run', 'backend.sock')
}

export function getBackendClient(): BackendClient {
  client ??= createGgrClient({
    socketPath: getBackendSocketPath(),
    client: 'electron',
    clientVersion: app.getVersion(),
    protocolVersion: 1
  })
  return client
}

export async function connectBackend(): Promise<SystemHealthResult> {
  const backend = getBackendClient()
  await backend.connect()
  notifyConnected(backend)
  return await backend.request('system.health') as SystemHealthResult
}

export function onBackendConnected(listener: (backend: BackendClient) => void): () => void {
  connectedListeners.add(listener)
  return () => connectedListeners.delete(listener)
}

export function setBackendClientForTesting(value: BackendClient | undefined): void {
  client = value
}

export function toElectronError(error: unknown): Error & { code?: string; data?: unknown } {
  const source = error as { message?: unknown; code?: unknown; data?: unknown } | undefined
  const mapped = new Error(typeof source?.message === 'string' ? source.message : 'Backend request failed') as Error & { code?: string; data?: unknown }
  mapped.name = 'BackendRpcError'
  if (typeof source?.code === 'string') mapped.code = source.code
  if (source?.data !== undefined) mapped.data = source.data
  return mapped
}

export async function requestBackend<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    const backend = getBackendClient()
    if (!backend.connected) {
      await backend.connect()
      notifyConnected(backend)
    }
    return await backend.request(method, params) as T
  } catch (error) {
    throw toElectronError(error)
  }
}
