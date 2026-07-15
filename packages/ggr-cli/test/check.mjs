import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createCli } from '../lib/cli.mjs'

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-cli-'))
const backendSocket = path.join(directory, 'backend.sock')
const supervisorSocket = path.join(directory, 'supervisor.sock')
const calls = []

async function listen(socketPath, handler) {
  const server = net.createServer((socket) => {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        const request = JSON.parse(line)
        const result = handler(request)
        socket.write(`${JSON.stringify({ id: request.id, result })}\n`)
      }
    })
  })
  await new Promise((resolve) => server.listen(socketPath, resolve))
  return server
}

const backend = await listen(backendSocket, (request) => {
  calls.push(['backend', request.method, request.params])
  if (request.method === 'system.handshake') return { protocolMin: 1, protocolMax: 1 }
  if (request.method === 'system.health') return { version: '1.2.3', status: 'ok' }
  if (request.method === 'task.start') return { workerId: request.params.workerId, started: true }
  if (request.method === 'task.stop') return { workerId: request.params.workerId, stopped: true }
  if (request.method === 'task.list') return [{ workerId: 'auto-chat', status: 'running' }]
  throw new Error(`Unexpected backend method: ${request.method}`)
})
const supervisor = await listen(supervisorSocket, (request) => {
  calls.push(['supervisor', request.method, request.params])
  if (request.method === 'system.handshake') return { protocolMin: 1, protocolMax: 1 }
  if (request.method === 'supervisor.status') return { current: '1.2.3' }
  if (request.method === 'update.check') return { available: '1.2.4' }
  throw new Error(`Unexpected supervisor method: ${request.method}`)
})

const output = []
const cli = createCli({
  backendSocket,
  supervisorSocket,
  clientVersion: '1.0.0',
  write: (line) => output.push(line)
})

await cli.run(['status'])
assert.deepEqual(JSON.parse(output.pop()), { version: '1.2.3', status: 'ok' })
await cli.run(['start', 'auto-chat', '--headless'])
assert.deepEqual(calls.at(-1), ['backend', 'task.start', { workerId: 'geekAutoStartWithBossMain', options: { headless: true } }])
await cli.run(['stop', 'read-no-reply'])
assert.deepEqual(calls.at(-1), ['backend', 'task.stop', { workerId: 'readNoReplyAutoReminderMain' }])
await cli.run(['update', 'check'])
assert.deepEqual(JSON.parse(output.pop()), { available: '1.2.4' })
assert.equal(calls.some(([target]) => target === 'supervisor'), true)
assert.doesNotMatch(await fs.readFile(new URL('../lib/cli.mjs', import.meta.url), 'utf8').catch(() => ''), /child_process/)

await Promise.all([
  new Promise((resolve) => backend.close(resolve)),
  new Promise((resolve) => supervisor.close(resolve))
])
await fs.rm(directory, { recursive: true, force: true })
console.log('ggr-cli check passed')
