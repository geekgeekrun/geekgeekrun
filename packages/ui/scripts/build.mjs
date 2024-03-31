import childProcess from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import url from 'node:url'

const rawCwd = process.cwd()
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const sqlitePluginDirPath = path.join(__dirname, '../../sqlite-plugin')
process.chdir(sqlitePluginDirPath)
try {
  const sqlitePluginBuildProcess = childProcess.spawnSync('pnpm run build', {
    stdio: ['inherit', 'inherit', 'inherit'],
    shell: true
  })
  process.chdir(rawCwd)
  if (sqlitePluginBuildProcess.error) {
    throw sqlitePluginBuildProcess.error
  }
} catch(error) {
  process.chdir(rawCwd)
  console.error('error encouter when build sqlite plugin:')
  console.error(error)
  process.exit(1)
}
