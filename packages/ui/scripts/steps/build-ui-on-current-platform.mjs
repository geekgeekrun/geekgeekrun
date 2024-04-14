import childProcess from 'node:child_process'
import { osPlatformToBuildCommandMap, currentOsPlatform } from '../vars/os.mjs'

export default function buildUiOnCurrentPlatform() {
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
