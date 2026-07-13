import os from 'node:os'
import { createRuntimePaths } from '../../../../../../ggr-backend/lib/runtime-paths.mjs'
import { createBrowserHistory } from '../../../../../../ggr-backend/lib/services/browser/dependencies/browser-history.mjs'

export interface BrowserInfo { browser: string; executablePath: string }
const history = createBrowserHistory({ storageDir: createRuntimePaths(os.homedir()).storageDir })
export const lastUsedBrowserRecordFilePath = history.recordFile
export const getLastUsedAndAvailableBrowser = () => history.read()
export const saveLastUsedAndAvailableBrowserInfo = (value: BrowserInfo) => history.write(value)
export const removeLastUsedAndAvailableBrowserPath = () => history.remove()
