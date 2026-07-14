import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const bootstrap = path.join(root, 'packages/ui/resources/ggrd-bootstrap')
const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'ggrd-bootstrap-runtime-'))
try {
  await run(process.execPath, ['scripts/build-ggrd-bootstrap.mjs'], { cwd: root })
  const runtime = path.join(bootstrap, 'runtime')
  const node = path.join(runtime, 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  assert.equal((await fs.lstat(node)).isFile(), true, 'bootstrap must contain a regular pinned runtime executable')
  const metadata = JSON.parse(await fs.readFile(path.join(bootstrap, 'runtime.json'), 'utf8'))
  assert.equal(metadata.node, process.version)
  assert.equal(metadata.layout, 'node-distribution')
  const { stdout } = await run(node, ['--version'], { cwd: isolated, env: { PATH: '/usr/bin:/bin', HOME: isolated, DYLD_LIBRARY_PATH: '', DYLD_FALLBACK_LIBRARY_PATH: '' } })
  assert.equal(stdout.trim(), process.version, 'copied runtime must execute without host PATH or DYLD paths')
  if (process.platform === 'darwin') {
    const { stdout: links } = await run('otool', ['-L', node])
    assert.doesNotMatch(links, /Homebrew|Cellar|opt\/homebrew/i, 'runtime must not retain Homebrew dylib paths')
    assert.match(links, /@loader_path|\/usr\/lib\//, 'runtime dylibs must resolve from its own layout or macOS system libraries')
  }
} finally {
  await fs.rm(isolated, { recursive: true, force: true })
}
console.log('ggrd bootstrap runtime check passed')
