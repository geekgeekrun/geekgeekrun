import os from 'node:os'
import path from 'node:path'
import { createGgrClient } from '@geekgeekrun/ggr-client'
import { createBackendController } from '../../ggr-controller/index.mjs'

function defaultSocketPath() {
  return process.env.GGR_BACKEND_SOCKET ?? path.join(os.homedir(), '.geekgeekrun', 'run', 'backend.sock')
}

function createDefaultClient() {
  return createGgrClient({
    socketPath: defaultSocketPath(),
    client: 'ggr-mcp',
    clientVersion: '0.1.0'
  })
}

function canReconnect(error) {
  return error?.code === 'CONNECTION_CLOSED'
}

export function createAgentService({ client = createDefaultClient() } = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new TypeError('client.request is required')
  }

  async function connect() {
    if (client.connected === false && typeof client.connect === 'function') {
      await client.connect()
    }
  }

  const controller = createBackendController({
    client: {
      async request(method, params) {
        await connect()
        try {
          return await client.request(method, params)
        } catch (error) {
          if (!canReconnect(error) || typeof client.connect !== 'function') throw error
          await client.connect()
          return client.request(method, params)
        }
      }
    }
  })

  return { ...controller, connect }
}
