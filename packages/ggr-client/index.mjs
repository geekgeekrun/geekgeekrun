import net from 'node:net'
import { randomUUID } from 'node:crypto'
import {
  METHODS,
  PROTOCOL_VERSION,
  createRequest
} from '@geekgeekrun/ggr-protocol'

function rpcError(code, message, data) {
  const error = new Error(message)
  error.code = code
  if (data !== undefined) error.data = data
  return error
}

export function createGgrClient(options) {
  let socket = null
  let transportReady = false
  let connected = false
  let connecting = null
  const pending = new Map()
  const eventListeners = new Set()

  function rejectPending(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer)
      reject(error)
    }
    pending.clear()
  }

  function resetConnection(target, error = rpcError('CONNECTION_CLOSED', 'Connection closed')) {
    if (socket !== target) return
    socket = null
    transportReady = false
    connected = false
    rejectPending(error)
  }

  function handleMessage(message) {
    if (message && typeof message.event === 'string') {
      for (const listener of eventListeners) {
        try {
          listener(message)
        } catch {
          // Consumer listener failures must not affect the transport or other listeners.
        }
      }
      return
    }

    if (!message || typeof message.id !== 'string') return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)

    if (message.error) {
      request.reject(rpcError(
        message.error.code,
        message.error.message,
        message.error.data
      ))
      return
    }
    request.resolve(message.result)
  }

  function attachSocket(target) {
    let buffer = ''
    target.setEncoding('utf8')
    target.on('data', (chunk) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        let message
        try {
          message = JSON.parse(line)
        } catch {
          target.destroy()
          return
        }
        handleMessage(message)
      }
    })
    target.on('close', () => resetConnection(target))
    target.on('error', () => {})
  }

  function sendRequest(method, params, timeoutMs) {
    if (!socket || !transportReady || socket.destroyed) {
      return Promise.reject(rpcError('CONNECTION_CLOSED', 'Connection closed'))
    }

    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(rpcError('REQUEST_TIMEOUT', `Request timed out: ${method}`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })

      try {
        socket.write(`${JSON.stringify(createRequest(id, method, params))}\n`)
      } catch (error) {
        clearTimeout(timer)
        pending.delete(id)
        reject(error)
      }
    })
  }

  async function discardSocket(target) {
    resetConnection(target)
    if (!target.destroyed) target.destroy()
  }

  return {
    async connect() {
      if (connected) return
      if (connecting) return connecting

      connecting = (async () => {
        const target = net.createConnection({ path: options.socketPath })
        socket = target
        attachSocket(target)

        try {
          await new Promise((resolve, reject) => {
            const timeoutMs = options.connectTimeoutMs ?? 10000
            const timer = setTimeout(() => {
              reject(rpcError('CONNECT_TIMEOUT', 'Connection timed out'))
              target.destroy()
            }, timeoutMs)
            target.once('connect', () => {
              clearTimeout(timer)
              transportReady = true
              resolve()
            })
            target.once('error', (error) => {
              clearTimeout(timer)
              reject(error)
            })
          })

          const protocolVersion = options.protocolVersion ?? PROTOCOL_VERSION
          const handshake = await sendRequest(METHODS.SYSTEM_HANDSHAKE, {
            client: options.client,
            clientVersion: options.clientVersion,
            protocolVersion
          }, options.requestTimeoutMs ?? 10000)

          if (!handshake ||
              protocolVersion < handshake.protocolMin ||
              protocolVersion > handshake.protocolMax) {
            throw rpcError(
              'PROTOCOL_INCOMPATIBLE',
              `Protocol version ${protocolVersion} is not supported by backend`
            )
          }
          connected = true
        } catch (error) {
          await discardSocket(target)
          throw error
        }
      })().finally(() => {
        connecting = null
      })

      return connecting
    },

    async request(method, params = {}, { timeoutMs = options.requestTimeoutMs ?? 10000 } = {}) {
      if (!connected) throw rpcError('CONNECTION_CLOSED', 'Connection closed')
      return sendRequest(method, params, timeoutMs)
    },

    onEvent(listener) {
      eventListeners.add(listener)
      return () => eventListeners.delete(listener)
    },

    async close() {
      const target = socket
      if (!target) return
      await discardSocket(target)
    },

    get connected() {
      return connected
    }
  }
}
