import childProcess from 'node:child_process'
import path from 'node:path'
import url from 'node:url'

export default function buildSqlitePlugin() {
  const rawCwd = process.cwd()
  const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

  const sqlitePluginDirPath = path.join(__dirname, '../../../sqlite-plugin')
  process.chdir(sqlitePluginDirPath)
  try {
    const usePnpm = process.env.npm_config_user_agent?.startsWith('pnpm')
    const packageManager = usePnpm ? 'pnpm' : 'npm'
    const command = process.platform === 'win32' ? `${packageManager}.cmd` : packageManager
    const sqlitePluginBuildProcess = childProcess.spawnSync(command, ['run', 'build'], {
      stdio: ['inherit', 'inherit', 'inherit']
    })
    process.chdir(rawCwd)
    if (sqlitePluginBuildProcess.error) {
      throw sqlitePluginBuildProcess.error
    }
    if (sqlitePluginBuildProcess.status) {
      process.exit(sqlitePluginBuildProcess.status)
    }
  } catch (error) {
    process.chdir(rawCwd)
    console.error('error encounter when build sqlite plugin:')
    console.error(error)
    process.exit(1)
  }
}
