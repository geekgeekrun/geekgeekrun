import os from 'node:os'
import path from 'node:path'
import { createGgrClient } from '../../ggr-client/index.mjs'

const WORKERS = new Set(['auto-chat', 'read-no-reply'])

function defaultSocket(name) {
  return path.join(os.homedir(), '.geekgeekrun', 'run', name)
}

function json(value) {
  return `${JSON.stringify(value)}\n`
}

export function createCli({
  backendSocket = process.env.GGR_BACKEND_SOCKET ?? defaultSocket('backend.sock'),
  supervisorSocket = process.env.GGR_SUPERVISOR_SOCKET ?? defaultSocket('supervisor.sock'),
  clientVersion = process.env.GGR_CLIENT_VERSION ?? '0.0.0',
  write = (line) => process.stdout.write(line),
  clientFactory = createGgrClient
} = {}) {
  function client(socketPath, name) {
    return clientFactory({
      socketPath,
      client: name,
      clientVersion,
      requestTimeoutMs: 30000
    })
  }

  async function request(socketPath, name, method, params = {}) {
    const connection = client(socketPath, name)
    try {
      await connection.connect()
      return await connection.request(method, params)
    } finally {
      await connection.close()
    }
  }

  async function run(argv) {
    const [command, ...args] = argv
    let result
    switch (command) {
      case 'status':
        result = await request(backendSocket, 'ggr-cli', 'system.health')
        break
      case 'tasks':
        result = await request(backendSocket, 'ggr-cli', 'task.list')
        break
      case 'start': {
        const workerId = args[0]
        if (!WORKERS.has(workerId)) throw new Error(`Unsupported worker: ${workerId}`)
        result = await request(backendSocket, 'ggr-cli', 'task.start', {
          workerId,
          options: { headless: args.includes('--headless') }
        })
        break
      }
      case 'stop': {
        const workerId = args[0]
        if (!WORKERS.has(workerId)) throw new Error(`Unsupported worker: ${workerId}`)
        result = await request(backendSocket, 'ggr-cli', 'task.stop', { workerId })
        break
      }
      case 'update': {
        const action = args[0]
        const methods = {
          status: 'supervisor.status',
          check: 'update.check',
          install: 'update.install',
          rollback: 'update.rollback'
        }
        if (!methods[action]) throw new Error(`Unsupported update command: ${action ?? ''}`)
        result = await request(supervisorSocket, 'ggr-cli', methods[action])
        break
      }
      default:
        throw new Error('Usage: ggr <status|tasks|start|stop|update>')
    }
    write(json(result))
    return result
  }

  return { run }
}
