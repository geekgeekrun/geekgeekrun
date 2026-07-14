import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('..', import.meta.url))
const output = path.join(repository, 'packages', 'ui', 'resources', 'ggrd-bootstrap')
const ggrd = path.join(repository, 'packages', 'ggrd')
const protocol = path.join(repository, 'packages', 'ggr-protocol')

async function copySupervisorSource() {
  await fs.rm(output, { recursive: true, force: true })
  await fs.mkdir(path.join(output, 'bin'), { recursive: true, mode: 0o700 })
  await fs.cp(ggrd, output, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}test${path.sep}`) && !source.endsWith(`${path.sep}test`) && !source.includes(`${path.sep}node_modules${path.sep}`) && !source.endsWith(`${path.sep}node_modules`)
  })
  await fs.mkdir(path.join(output, 'node_modules', '@geekgeekrun'), { recursive: true, mode: 0o700 })
  await fs.cp(protocol, path.join(output, 'node_modules', '@geekgeekrun', 'ggr-protocol'), { recursive: true })
  await fs.copyFile(process.execPath, path.join(output, 'bin', 'node'))
  await fs.chmod(path.join(output, 'bin', 'node'), (await fs.stat(process.execPath)).mode & 0o777)
  await fs.writeFile(path.join(output, 'runtime.json'), `${JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch })}\n`, { mode: 0o600 })
}

await copySupervisorSource()
console.log(`built ggrd bootstrap with pinned runtime ${process.version}`)
