import { findChrome } from "find-chrome-bin";
import * as os from 'node:os'

export default async function findAndLocateExistedChromiumExecutable() {
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
