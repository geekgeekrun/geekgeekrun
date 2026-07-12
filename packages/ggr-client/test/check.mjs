import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { createGgrClient } from '../index.mjs'

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ggr-client-'))
const socketPath = process.platform === 'win32'
  ? `\\\\.\\pipe\\ggr-client-${process.pid}-${Date.now()}`
  : path.join(tempDir, 'ggr.sock')

function rpcErrorCode(error) {
  return error?.code
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

function createServer({ protocolMin = 1, protocolMax = 1 } = {}) {
  return net.createServer((connection) => {
    let buffer = ''
    connection.setEncoding('utf8')
    connection.on('data', (chunk) => {
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        const request = JSON.parse(line)
        if (request.method === 'system.handshake') {
          connection.write(`${JSON.stringify({
            id: request.id,
            result: {
              backendVersion: '1.0.0',
              protocolMin,
              protocolMax,
              capabilities: [],
              state: 'ready',
              futureOptionalField: true
            }
          })}\n`)
          continue
        }
        if (request.method === 'system.health') {
          connection.write(`${JSON.stringify({
            id: request.id,
            result: { ok: true },
            futureOptionalField: true
          })}\n`)
          connection.write(`${JSON.stringify({
            event: 'task.progress',
            data: { progress: 50 },
            futureOptionalField: true
          })}\n`)
          continue
        }
        if (request.method === 'test.close') {
          connection.destroy()
        }
      }
    })
  })
}

let server = createServer()
try {
  await listen(server)
  const client = createGgrClient({
    socketPath,
    client: 'test',
    clientVersion: '1.0.0',
    requestTimeoutMs: 30
  })
  const events = []
  client.onEvent((message) => events.push(message))

  await client.connect()
  assert.equal(client.connected, true)
  await client.connect()
  assert.deepEqual(await client.request('system.health'), { ok: true })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(events[0].event, 'task.progress')

  await assert.rejects(client.request('test.timeout'), (error) => {
    assert.equal(rpcErrorCode(error), 'REQUEST_TIMEOUT')
    return true
  })
  await assert.rejects(client.request('test.close'), (error) => {
    assert.equal(rpcErrorCode(error), 'CONNECTION_CLOSED')
    return true
  })
  assert.equal(client.connected, false)

  await client.connect()
  assert.deepEqual(await client.request('system.health'), { ok: true })
  await client.close()
  assert.equal(client.connected, false)

  await closeServer(server)
  server = createServer({ protocolMin: 2, protocolMax: 3 })
  await listen(server)
  const incompatibleClient = createGgrClient({
    socketPath,
    client: 'test',
    clientVersion: '1.0.0',
    protocolVersion: 1
  })
  await assert.rejects(incompatibleClient.connect(), (error) => {
    assert.equal(rpcErrorCode(error), 'PROTOCOL_INCOMPATIBLE')
    return true
  })
  assert.equal(incompatibleClient.connected, false)
  await incompatibleClient.close()

  console.log('ggr-client check passed')
} finally {
  await closeServer(server).catch(() => {})
  await rm(tempDir, { recursive: true, force: true })
}
