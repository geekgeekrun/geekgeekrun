import { is } from '@electron-toolkit/utils'
import electron from 'electron'
import * as os from 'node:os'
import * as fs from 'node:fs'
import path from 'node:path'
import { EXPECT_CHROMIUM_BUILD_ID } from './check-and-download-puppeteer-executable'
import {
  getExecutableFileVersion
} from '@geekgeekrun/utils/windows-only/file.mjs'
import { BrowserInfo } from './history-utils'

export default async function findAndLocateExistedChromiumExecutable(): Promise<BrowserInfo> {
  const exceptChromiumMainVersion = Number(EXPECT_CHROMIUM_BUILD_ID.split('.')[0])
  // For windows, try to find Edge(chromium)
  if (os.platform() === 'win32') {
    // TODO: handle windows
    const edgeExecutableLocation = path.join(
      process.env['ProgramFiles(x86)']!,
      'Microsoft/Edge/Application',
      'msedge.exe'
    )
    if (
      fs.existsSync(edgeExecutableLocation)
    ) {
      try {
        const version = await getExecutableFileVersion(edgeExecutableLocation)
        const mainVersion = Number(version.split('.')[0])
        if ( mainVersion >= exceptChromiumMainVersion) {
          return {
            executablePath: edgeExecutableLocation,
            browser: `Edge ${version}`
          }
        }
      } catch(err) {
        console.log(err)
      }
    }
  }

  // For other, use findChrome
  let findChrome: typeof import('find-chrome-bin').findChrome
  if (is.dev) {
    findChrome = (await import('find-chrome-bin')).findChrome
  } else {
    findChrome = (
      await import(
        'file://' +
        path.resolve(
          electron.app.getAppPath(),
          '..',
          'external-node-runtime-dependencies/index.mjs'
        )
      )
    ).findChromeBin.findChrome
  }
  const targetBrowser = await findChrome({
    min: exceptChromiumMainVersion
  })
  if (!targetBrowser?.executablePath) {
    throw new Error('NO_EXPECT_CHROMIUM_FOUND')
  }
  return {
    executablePath: targetBrowser.executablePath,
    browser: targetBrowser.browser
  }
}
