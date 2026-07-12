import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { METHODS, PROTOCOL_VERSION, assertHandshake } from '@geekgeekrun/ggr-protocol'
import { createLogger } from './lib/logger.mjs'
import { createRouter, registerServiceHandlers } from './lib/router.mjs'
import { createRpcServer } from './lib/rpc-server.mjs'
import { createRuntimePaths, migrateLegacyLayout } from './lib/runtime-paths.mjs'
import { createConfigService } from './lib/services/config-service.mjs'
import { createApprovalService } from './lib/services/approval-service.mjs'
import { createTaskService } from './lib/services/task-service.mjs'

export async function createBackendServer({ socketPath, version, runtimePaths, services = {}, verifyPeer, clock }) {
  if (!runtimePaths) throw new TypeError('runtimePaths are required')
  const logger = services.logger ?? await createLogger({ filePath: runtimePaths.backendLog, clock })
  const config = services.config ?? createConfigService({ configDir: runtimePaths.configDir, clock })
  let rpc
  const emit = (event, data) => rpc?.publish(event, data)
  const task = services.task ?? createTaskService({
    spawnProcess: services.spawnProcess,
    workerEntries: services.workerEntries ?? {},
    emit,
    stopTimeoutMs: services.stopTimeoutMs
  })
  const approval = services.approval ?? createApprovalService({
    queueFilePath: path.join(runtimePaths.storageDir, 'hr-reply-approval-queue.json'),
    emit,
    clock
  })
  const router = createRouter()
    .register(METHODS.SYSTEM_HANDSHAKE, (params) => {
      try { assertHandshake(params) } catch (error) { throw Object.assign(error, { code: 'INVALID_PARAMS' }) }
      if (params.protocolVersion !== PROTOCOL_VERSION) throw Object.assign(new Error(`Protocol version ${params.protocolVersion} is not supported`), { code: 'PROTOCOL_INCOMPATIBLE' })
      return { protocolMin: PROTOCOL_VERSION, protocolMax: PROTOCOL_VERSION, version }
    })
    .register(METHODS.SYSTEM_HEALTH, () => ({ ready: true, version, protocolVersion: PROTOCOL_VERSION }))
    .register(METHODS.CONFIG_READ, (params) => config.read(params))
    .register(METHODS.CONFIG_WRITE, (params) => config.write(params))

  registerServiceHandlers(router, { methods: METHODS, task, approval })

  for (const [method, handler] of Object.entries(services.handlers ?? {})) router.register(method, handler)
  rpc = createRpcServer({ socketPath, router, verifyPeer, logger })
  let started = false
  let closed = false
  return {
    async start() {
      if (started) return
      if (closed) throw new Error('Backend server is closed')
      await migrateLegacyLayout(runtimePaths)
      await rpc.start()
      started = true
    },
    async stop() {
      if (closed) return
      await task.stopAll?.()
      await rpc.stop()
      await config.close?.()
      await logger.close?.()
      started = false
      closed = true
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runtimePaths = createRuntimePaths(os.homedir())
  const backend = await createBackendServer({ socketPath: runtimePaths.backendSocket, version: '1.0.0', runtimePaths })
  await backend.start()
  const shutdown = async () => { await backend.stop(); process.exit(0) }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
