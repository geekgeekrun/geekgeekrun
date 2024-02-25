import { is } from '@electron-toolkit/utils'
import electron from 'electron'
import * as os from 'node:os'
import path from 'node:path'

export default async function findAndLocateExistedChromiumExecutable() {
  let findChrome: typeof import('find-chrome-bin').findChrome
  if (is.dev) {
    findChrome = (await import('find-chrome-bin')).findChrome
  } else {
    findChrome = (
      await import(
        path.resolve(
          electron.app.getAppPath(),
          '..',
          'external-node-runtime-dependencies/index.mjs'
        )
      )
    ).findChromeBin.findChrome
  }
  // For windows, try to find Edge(chromium)
  if (os.platform() === 'win32') {
    // TODO: handle windows
  }
  // For other, use findChrome
  const targetBrowser = await findChrome({})
  if (!targetBrowser?.executablePath) {
    throw new Error('NO_EXPECT_CHROMIUM_FOUND')
  }
  return {
    path: targetBrowser.executablePath
  }
}
