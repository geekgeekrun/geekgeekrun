import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { createError, createResult } from '@geekgeekrun/ggr-protocol'

const STABLE_CODES = new Set(['INVALID_PARAMS', 'METHOD_NOT_FOUND', 'PROTOCOL_INCOMPATIBLE', 'HANDSHAKE_REQUIRED', 'TASKS_ACTIVE', 'BACKEND_UNAVAILABLE', 'INSTALLER_UNAVAILABLE'])

export function createSupervisorRpcServer({ socketPath, api, logger = { write: async () => {} } } = {}) {
  if (!path.isAbsolute(socketPath) || !api?.dispatch) throw new TypeError('An absolute socketPath and supervisor API are required')
  let server = null
  let ownedSocket = null
  const sockets = new Set()

  async function removeStaleSocket() {
    const info = await fs.lstat(socketPath).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (!info) return
    if (!info.isSocket() || info.uid !== process.getuid()) throw new Error(`Refusing to unlink socket not owned by current user: ${socketPath}`)
    await fs.unlink(socketPath)
  }
  function serve(socket) {
    sockets.add(socket)
    socket.setEncoding('utf8')
    socket.on('close', () => sockets.delete(socket))
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk
      void drain()
    })
    async function drain() {
      let index
      while ((index = buffer.indexOf('\n')) >= 0 && !socket.destroyed) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
        if (!line) continue
        let request
        try { request = JSON.parse(line) } catch { socket.destroy(); return }
        try {
          const result = await api.dispatch(request)
          await logger.write('info', 'supervisor.rpc', { correlationId: request.id, method: request.method, params: request.params, result })
          socket.write(`${JSON.stringify(createResult(request.id, result))}\n`)
        } catch (error) {
          const code = STABLE_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR'
          await logger.write('error', 'supervisor.rpc_failed', { correlationId: request?.id, method: request?.method, params: request?.params, error: { code, message: error?.message } })
          socket.write(`${JSON.stringify(createError(request?.id ?? '', code, code === 'INTERNAL_ERROR' ? 'Internal error' : error.message, error.data))}\n`)
        }
      }
    }
  }
  return Object.freeze({
    async start() {
      if (server) return
      await fs.mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 })
      await fs.chmod(path.dirname(socketPath), 0o700)
      await removeStaleSocket()
      server = net.createServer(serve)
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve) })
      await fs.chmod(socketPath, 0o600)
      const info = await fs.lstat(socketPath)
      ownedSocket = { dev: info.dev, ino: info.ino }
    },
    async stop() {
      const target = server; server = null
      for (const socket of sockets) socket.destroy()
      if (target) await new Promise((resolve) => target.close(resolve))
      const info = await fs.lstat(socketPath).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
      if (info && ownedSocket && info.isSocket() && info.dev === ownedSocket.dev && info.ino === ownedSocket.ino) await fs.unlink(socketPath)
      ownedSocket = null
    }
  })
}
