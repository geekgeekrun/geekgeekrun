import childProcess from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import url from 'node:url'

const currentOsPlatform = os.platform()
const osPlatformToBuildCommandMap = {
  darwin: 'mac',
  linux: 'linux',
  win32: 'win'
}

export default function build() {
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
  } catch (error) {
    process.chdir(rawCwd)
    console.error('error encounter when build sqlite plugin:')
    console.error(error)
    process.exit(1)
  }
  try {
    const uiBuildProcess = childProcess.spawnSync(
      `pnpm run build:${osPlatformToBuildCommandMap[currentOsPlatform]}`,
      {
        stdio: ['inherit', 'inherit', 'inherit'],
        shell: true
      }
    )
    if (uiBuildProcess.error) {
      throw uiBuildProcess.error
    }
  } catch (error) {
    console.error('error encounter when build ui:')
    console.error(error)
    process.exit(1)
  }
}
