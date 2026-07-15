import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { createError, createEvent, createResult } from '@geekgeekrun/ggr-protocol'

const STABLE_CODES = new Set(['INVALID_PARAMS', 'METHOD_NOT_FOUND', 'PROTOCOL_INCOMPATIBLE', 'HANDSHAKE_REQUIRED', 'PEER_REJECTED'])

export function createRpcServer({ socketPath, router, verifyPeer = async () => true, logger }) {
  let server = null
  let ownedSocket = null
  const sockets = new Set()
  const subscribers = new Set()

  async function removeStaleSocket() {
    const info = await fs.lstat(socketPath).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
    if (!info) return
    if (!info.isSocket() || info.uid !== process.getuid()) throw new Error(`Refusing to unlink socket not owned by current user: ${socketPath}`)
    await fs.unlink(socketPath)
  }

  function serve(socket) {
    sockets.add(socket)
    socket.on('close', () => { sockets.delete(socket); subscribers.delete(socket) })
    let buffer = ''
    let handshaken = false
    let accepted = false
    Promise.resolve(verifyPeer(socket)).then((verified) => {
      if (!verified) throw Object.assign(new Error('Peer verification rejected connection'), { code: 'PEER_REJECTED' })
      accepted = true
      void drain()
    }).catch(() => socket.destroy())
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      if (!accepted) { buffer += chunk; return }
      buffer += chunk
      void drain()
    })
    async function drain() {
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1 && !socket.destroyed) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        let request
        try { request = JSON.parse(line) } catch { socket.destroy(); return }
        if (!request || typeof request.id !== 'string' || typeof request.method !== 'string') { socket.destroy(); return }
        try {
          if (!handshaken && request.method !== 'system.handshake') throw Object.assign(new Error('system.handshake must be the first request'), { code: 'HANDSHAKE_REQUIRED' })
          const result = await router.dispatch(request, { socket, correlationId: request.id })
          if (request.method === 'system.handshake') { handshaken = true; subscribers.add(socket) }
          await logger.write('info', 'rpc.request', { correlationId: request.id, method: request.method, params: request.params, result })
          socket.write(`${JSON.stringify(createResult(request.id, result))}\n`)
        } catch (error) {
          const code = STABLE_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR'
          await logger.write('error', 'rpc.request_failed', { correlationId: request.id, method: request.method, params: request.params, error: { code, message: error.message } })
          socket.write(`${JSON.stringify(createError(request.id, code, code === 'INTERNAL_ERROR' ? 'Internal error' : error.message))}\n`)
        }
      }
    }
  }

  return {
    async start() {
      if (server) return
      await fs.mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 })
      await fs.chmod(path.dirname(socketPath), 0o700)
      await removeStaleSocket()
      server = net.createServer(serve)
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(socketPath, resolve)
      })
      await fs.chmod(socketPath, 0o600)
      const info = await fs.lstat(socketPath)
      ownedSocket = { dev: info.dev, ino: info.ino }
    },
    async stop() {
      const target = server
      server = null
      for (const socket of sockets) socket.destroy()
      if (target) await new Promise((resolve) => target.close(resolve))
      subscribers.clear()
      const info = await fs.lstat(socketPath).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error))
      if (info && ownedSocket && info.isSocket() && info.dev === ownedSocket.dev && info.ino === ownedSocket.ino) await fs.unlink(socketPath)
      ownedSocket = null
    },
    publish(event, data) {
      const line = `${JSON.stringify(createEvent(event, data))}\n`
      for (const socket of subscribers) {
        if (!socket.destroyed) socket.write(line)
      }
    }
  }
}
