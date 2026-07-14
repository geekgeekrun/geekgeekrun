import fs from 'node:fs'
import { createGunzip } from 'node:zlib'

function text(block) {
  const terminator = block.indexOf(0)
  return block.subarray(0, terminator < 0 ? block.length : terminator).toString('utf8')
}

function size(block) {
  const value = text(block).trim()
  if (!/^[0-7]*$/.test(value)) throw Object.assign(new Error('Invalid tar size'), { code: 'EXTRACTOR_INVALID' })
  return parseInt(value || '0', 8)
}

export async function extractTarGzip({ archive, maxBytes }) {
  const chunks = []
  let total = 0
  const input = fs.createReadStream(archive).pipe(createGunzip())
  for await (const chunk of input) {
    total += chunk.length
    if (total > maxBytes + 512 * 1024) throw Object.assign(new Error('Archive exceeds declared extraction size'), { code: 'EXTRACTION_TOO_LARGE' })
    chunks.push(chunk)
  }
  const payload = Buffer.concat(chunks)
  const entries = []
  for (let offset = 0; offset + 512 <= payload.length;) {
    const header = payload.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const name = text(header.subarray(0, 100))
    const prefix = text(header.subarray(345, 500))
    const type = String.fromCharCode(header[156] || 48)
    const length = size(header.subarray(124, 136))
    const bodyStart = offset + 512
    const bodyEnd = bodyStart + length
    if (!name || bodyEnd > payload.length) throw Object.assign(new Error('Truncated tar entry'), { code: 'EXTRACTOR_INVALID' })
    const entryPath = prefix ? `${prefix}/${name}` : name
    if (type === '0' || type === '\0') entries.push({ path: entryPath, type: 'file', data: payload.subarray(bodyStart, bodyEnd) })
    else if (type === '5') entries.push({ path: entryPath.replace(/\/$/, ''), type: 'directory' })
    else throw Object.assign(new Error('Unsupported tar entry type'), { code: 'EXTRACTION_UNSAFE' })
    offset = bodyStart + Math.ceil(length / 512) * 512
  }
  return entries
}
