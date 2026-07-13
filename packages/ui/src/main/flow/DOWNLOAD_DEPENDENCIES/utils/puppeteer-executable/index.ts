import os from 'node:os'
import { createRuntimePaths } from '../../../../../../../ggr-backend/lib/runtime-paths.mjs'
import { createDefaultBrowserDependencies } from '../../../../../../../ggr-backend/lib/services/browser/dependencies/default-dependencies.mjs'
import type { BrowserInfo } from '../browser-history'

const dependencies = createDefaultBrowserDependencies({ runtimePaths: createRuntimePaths(os.homedir()) })

export const checkAndDownloadPuppeteerExecutable = async (options: {
  downloadProgressCallback?: (downloadedBytes: number, totalBytes: number) => void
  confirmContinuePromise?: Promise<void>
} = {}) => (await dependencies).ensure(options)

export const getAnyAvailablePuppeteerExecutable = async (options: {
  ignoreCached?: boolean
  noSave?: boolean
} = {}): Promise<BrowserInfo | null> => (await dependencies).discover(options)

export const findAndLocateUserInstalledChromiumExecutableSync = async (): Promise<BrowserInfo> => {
  const value = await (await dependencies).discover({ ignoreCached: true, noSave: true })
  if (!value) throw new Error('NO_EXPECT_CHROMIUM_FOUND')
  return value
}
