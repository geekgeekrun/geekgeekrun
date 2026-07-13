import os from 'node:os'
import { createRuntimePaths } from '../../runtime-paths.mjs'
import { createRecordsService } from '../records-service.mjs'
import { createBrowserService } from '../browser-service.mjs'
import { createBackendBrowserRuntime } from './runtime.mjs'
import { createBrowserRecords } from './records.mjs'

const runtimePaths = createRuntimePaths(os.homedir())
const recordsService = createRecordsService({ databaseFile: runtimePaths.databaseFile })
const records = createBrowserRecords({ getDataSource: recordsService.getDataSource })
const runtime = createBackendBrowserRuntime({ runtimePaths, records, onIdle: () => recordsService.close() })
const browser = createBrowserService({ runtime })

export const launchBossZhipinLoginPageWithPreloadExtension = () =>
  browser.openLogin()

export const launchBossSite = () =>
  browser.openBoss()

export const closeCompatibilityBrowserRuntime = async () => {
  await Promise.allSettled([browser.close(), recordsService.close()])
}
