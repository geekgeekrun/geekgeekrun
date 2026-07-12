import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { migrateLegacyLayout } from '../lib/runtime-paths.mjs'
import { createRuntimePaths } from '../lib/runtime-paths.mjs'

async function fixture() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ggr-legacy-'))
  const paths = createRuntimePaths(home)
  await fs.mkdir(path.join(paths.rootDir, 'config'), { recursive: true })
  await fs.mkdir(path.join(paths.rootDir, 'storage'), { recursive: true })
  await fs.writeFile(path.join(paths.rootDir, 'config', 'boss.json'), '{"openingMessage":"legacy"}\n')
  await fs.writeFile(path.join(paths.rootDir, 'storage', 'state.json'), '{"ready":true}\n')
  await fs.writeFile(path.join(paths.rootDir, 'storage', 'public.db'), 'legacy database')
  return { home, paths }
}

{
  const { home, paths } = await fixture()
  try {
    await migrateLegacyLayout(paths)
    assert.equal(await fs.readFile(path.join(paths.configDir, 'boss.json'), 'utf8'), '{"openingMessage":"legacy"}\n')
    assert.equal(await fs.readFile(path.join(paths.storageDir, 'state.json'), 'utf8'), '{"ready":true}\n')
    assert.equal(await fs.readFile(paths.databaseFile, 'utf8'), 'legacy database')
    assert.equal(await fs.readlink(path.join(paths.rootDir, 'config')), 'data/config')
    assert.equal(await fs.readlink(path.join(paths.rootDir, 'storage')), 'data/storage')
    assert.equal(await fs.readlink(path.join(paths.storageDir, 'public.db')), '../database.sqlite')
    assert.equal((await fs.stat(paths.rootDir)).mode & 0o777, 0o700)
    assert.equal((await fs.stat(path.join(paths.configDir, 'boss.json'))).mode & 0o777, 0o600)
    assert.equal((await fs.stat(path.join(paths.storageDir, 'state.json'))).mode & 0o777, 0o600)
    assert.equal((await fs.stat(paths.databaseFile)).mode & 0o777, 0o600)
    assert.equal((await fs.stat(paths.layoutVersionFile)).mode & 0o777, 0o600)

    await migrateLegacyLayout(paths)
    assert.equal(await fs.readlink(path.join(paths.rootDir, 'config')), 'data/config')
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}

{
  const { home, paths } = await fixture()
  try {
    await fs.rm(path.join(paths.rootDir, 'config'), { recursive: true })
    await fs.symlink('/tmp', path.join(paths.rootDir, 'config'))
    await assert.rejects(migrateLegacyLayout(paths), /outside expected data directory/)
    await assert.rejects(fs.lstat(paths.layoutVersionFile), { code: 'ENOENT' })
    assert.equal(await fs.readlink(path.join(paths.rootDir, 'config')), '/tmp')
  } finally {
    await fs.rm(home, { recursive: true, force: true })
  }
}

console.log('ggr backend legacy layout check passed')
