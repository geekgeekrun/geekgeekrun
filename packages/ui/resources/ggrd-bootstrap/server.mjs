import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequest } from '@geekgeekrun/ggr-protocol'
import { createVersionStore } from './lib/version-store.mjs'
import { createBackendProcessManager } from './lib/backend-process.mjs'
import { createSupervisorApi, createSupervisorDiagnostics } from './lib/supervisor-api.mjs'
import { createSupervisorRpcServer } from './lib/rpc-server.mjs'
import { createReleaseService } from './lib/release-service.mjs'
import { createMigrationService } from './lib/migration-service.mjs'

function backendClient(socketPath) {
  return {
    async request(method, params, { deadlineMs = 30_000 } = {}) {
      return new Promise((resolve, reject) => {
        const socket = net.createConnection(socketPath)
        let buffer = ''
        const handshakeId = `supervisor-handshake-${process.pid}`
        const requestId = `supervisor-request-${process.pid}-${Date.now()}`
        let settled = false
        const fail = (error) => { if (settled) return; settled = true; clearTimeout(timer); socket.destroy(); reject(error) }
        const succeed = (result) => { if (settled) return; settled = true; clearTimeout(timer); socket.end(); resolve(result) }
        const timeout = Number.isInteger(deadlineMs) && deadlineMs > 0 ? deadlineMs : 30_000
        const timer = setTimeout(() => fail(Object.assign(new Error('Backend RPC deadline elapsed'), { code: 'BACKEND_RPC_TIMEOUT' })), timeout)
        socket.setEncoding('utf8')
        socket.once('error', fail)
        socket.on('data', (chunk) => {
          buffer += chunk
          let newline
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
            if (!line) continue
            let reply; try { reply = JSON.parse(line) } catch { fail(new Error('Backend returned invalid JSONL')); return }
            if (reply.id === handshakeId) {
              if (reply.error) return fail(Object.assign(new Error(reply.error.message), { code: reply.error.code }))
              socket.write(`${JSON.stringify(createRequest(requestId, method, params))}\n`)
            } else if (reply.id === requestId) {
              if (reply.error) fail(Object.assign(new Error(reply.error.message), { code: reply.error.code, data: reply.error.data }))
              else succeed(reply.result)
            }
          }
        })
        socket.on('connect', () => socket.write(`${JSON.stringify(createRequest(handshakeId, 'system.handshake', { client: 'ggrd', clientVersion: '1.0.0', protocolVersion: 1 }))}\n`))
      })
    }
  }
}

export async function createSupervisorServer({
  runtimeDir = path.join(os.homedir(), '.geekgeekrun'),
  installer,
  checkForUpdates,
  releaseService,
  extract,
  fetchImpl,
  clientVersion = process.env.GGR_ELECTRON_VERSION,
  versionStore = createVersionStore(runtimeDir),
  backendSocketPath = path.join(runtimeDir, 'run', 'backend.sock'),
  supervisorSocketPath = path.join(runtimeDir, 'run', 'supervisor.sock'),
  diagnosticsPath = path.join(runtimeDir, 'logs', 'supervisor.jsonl')
} = {}) {
  const releases = releaseService ?? createReleaseService({ versionStore, extract, fetchImpl, clientVersion, migrationService: createMigrationService({ runtimeDir }) })
  const diagnostics = await createSupervisorDiagnostics({ filePath: diagnosticsPath })
  const client = backendClient(backendSocketPath)
  const processManager = createBackendProcessManager({
    versionStore, backendSocketPath, supervisorPath: supervisorSocketPath,
    healthCheck: async () => client.request('system.health', {}) ,
    diagnostic: (record) => diagnostics.write('error', record.event, record)
  })
  const api = createSupervisorApi({
    versionStore,
    processManager,
    backendClient: client,
    installer: installer ?? releases.install,
    checkForUpdates: checkForUpdates ?? releases.checkForUpdates,
    diagnostics
  })
  const rpc = createSupervisorRpcServer({ socketPath: supervisorSocketPath, api, logger: diagnostics })
  return Object.freeze({
    async start() { await rpc.start(); const current = await versionStore.current(); if (current) await processManager.start(current) },
    async stop() { await processManager.stop(); await rpc.stop(); await diagnostics.close() },
    api,
    processManager
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await createSupervisorServer()
  await server.start()
  const shutdown = async () => { await server.stop(); process.exit(0) }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
