import fs from 'node:fs/promises'
import path from 'node:path'
import { redactSecrets } from './services/config-service.mjs'

export async function createLogger({ filePath, clock = () => new Date(), maxBytes = 1024 * 1024 }) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await fs.chmod(path.dirname(filePath), 0o700)
  let handle = await fs.open(filePath, 'a', 0o600)
  await fs.chmod(filePath, 0o600)
  let size = (await handle.stat()).size
  let operations = Promise.resolve()
  let closed = false

  function serialize(operation) {
    const pending = operations.catch(() => {}).then(operation)
    operations = pending
    return pending
  }

  async function rotate(incomingBytes) {
    if (size === 0 || size + incomingBytes <= maxBytes) return
    await handle.sync()
    await handle.close()
    await fs.rm(`${filePath}.1`, { force: true })
    await fs.rename(filePath, `${filePath}.1`)
    handle = await fs.open(filePath, 'a', 0o600)
    await fs.chmod(filePath, 0o600)
    size = 0
  }

  return {
    async write(level, message, fields = {}) {
      const record = redactSecrets({ timestamp: clock().toISOString(), level, message, ...fields })
      const line = `${JSON.stringify(record)}\n`
      const bytes = Buffer.byteLength(line)
      return serialize(async () => {
        if (closed) throw new Error('Logger is closed')
        await rotate(bytes)
        await handle.write(line)
        size += bytes
      })
    },
    async close() {
      return serialize(async () => {
        if (closed) return
        closed = true
        const target = handle
        handle = null
        await target.sync()
        await target.close()
      })
    }
  }
}
