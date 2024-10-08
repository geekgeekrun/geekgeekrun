import { ipcMain, shell, app } from 'electron'

import * as childProcess from 'node:child_process'
import {
  ensureConfigFileExist,
  ensureStorageFileExist,
  configFileNameList,
  readConfigFile,
  writeConfigFile,
  readStorageFile,
  writeStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { ChildProcess } from 'child_process'
import * as JSONStream from 'JSONStream'
import { checkCookieListFormat } from '../../../../common/utils/cookie'
import { getAnyAvailablePuppeteerExecutable } from '../../../flow/CHECK_AND_DOWNLOAD_DEPENDENCIES/utils/puppeteer-executable/index'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { AUTO_CHAT_ERROR_EXIT_CODE } from '../../../../common/enums/auto-start-chat'
import { mainWindow } from '../../../window/mainWindow'
import {
  getAutoStartChatRecord,
  getBossLibrary,
  getCompanyLibrary,
  getJobLibrary
} from '../utils/db/index'
import { PageReq } from '../../../../common/types/pagination'
import { pipeWriteRegardlessError } from '../../utils/pipe'
import { WriteStream } from 'node:fs'

export default function initIpc() {
  ipcMain.on('open-external-link', (_, link) => {
    shell.openExternal(link, {
      activate: true
    })
  })

  ipcMain.handle('fetch-config-file-content', async () => {
    const configFileContentList = configFileNameList.map((fileName) => {
      return readConfigFile(fileName)
    })
    const result = {
      config: {}
    }

    configFileNameList.forEach((fileName, index) => {
      result.config[fileName] = configFileContentList[index]
    })

    return result
  })

  ipcMain.handle('save-config-file-from-ui', async (ev, payload) => {
    payload = JSON.parse(payload)
    ensureConfigFileExist()

    const dingtalkConfig = readConfigFile('dingtalk.json')
    dingtalkConfig.groupRobotAccessToken = payload.dingtalkRobotAccessToken

    const bossConfig = readConfigFile('boss.json')
    bossConfig.anyCombineRecommendJobFilter = payload.anyCombineRecommendJobFilter

    return await Promise.all([
      writeConfigFile('dingtalk.json', dingtalkConfig),
      writeConfigFile('target-company-list.json', payload.expectCompanies.split(',')),
      writeConfigFile('boss.json', bossConfig),
    ])
  })

  ipcMain.handle('read-storage-file', async (ev, payload) => {
    ensureStorageFileExist()
    return await readStorageFile(payload.fileName)
  })

  ipcMain.handle('write-storage-file', async (ev, payload) => {
    ensureStorageFileExist()

    return await writeStorageFile(payload.fileName, JSON.parse(payload.data))
  })

  // const currentExecutablePath = app.getPath('exe')
  // console.log(currentExecutablePath)
  ipcMain.handle('prepare-run-geek-auto-start-chat-with-boss', async () => {
    mainWindow?.webContents.send('locating-puppeteer-executable')
    const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
    if (!puppeteerExecutable) {
      return Promise.reject('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')
    }
    mainWindow?.webContents.send('puppeteer-executable-is-located')
  })

  let subProcessOfPuppeteer: ChildProcess | null = null
  ipcMain.handle('run-geek-auto-start-chat-with-boss', async () => {
    if (subProcessOfPuppeteer) {
      return
    }
    const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
    if (!puppeteerExecutable) {
      return Promise.reject('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')
    }
    const subProcessEnv = {
      ...process.env,
      MAIN_BOSSGEEKGO_UI_RUN_MODE: 'geekAutoStartWithBossDaemon',
      PUPPETEER_EXECUTABLE_PATH: puppeteerExecutable.executablePath
    }
    subProcessOfPuppeteer = childProcess.spawn(process.argv[0], process.argv.slice(1), {
      env: subProcessEnv,
      stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'ipc']
    })
    // console.log(subProcessOfPuppeteer)
    return new Promise((resolve, reject) => {
      subProcessOfPuppeteer!.stdio[3]!.pipe(JSONStream.parse()).on('data', async (raw) => {
        const data = raw
        switch (data.type) {
          case 'AUTO_START_CHAT_DAEMON_PROCESS_STARTUP': {
            subProcessOfPuppeteer!.stdio[3]!.write(
              JSON.stringify({
                type: 'GEEK_AUTO_START_CHAT_CAN_BE_RUN'
              })
            )
            break
          }
          case 'GEEK_AUTO_START_CHAT_WITH_BOSS_STARTED': {
            resolve(data)
            break
          }
          case 'LOGIN_STATUS_INVALID': {
            await sleep(500)
            mainWindow?.webContents.send('check-boss-zhipin-cookie-file')
            return
          }
          default: {
            return
          }
        }
      })

      subProcessOfPuppeteer!.once('exit', (exitCode) => {
        subProcessOfPuppeteer = null
        if (exitCode === AUTO_CHAT_ERROR_EXIT_CODE.PUPPETEER_IS_NOT_EXECUTABLE) {
          // means cannot find downloaded puppeteer
          reject('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')
        } else {
          mainWindow?.webContents.send('geek-auto-start-chat-with-boss-stopped')
        }
      })
    })
    // TODO:
  })

  ipcMain.handle('check-dependencies', async () => {
    const [anyAvailablePuppeteerExecutable] = await Promise.all([
      getAnyAvailablePuppeteerExecutable()
    ])
    return {
      puppeteerExecutableAvailable: !!anyAvailablePuppeteerExecutable
    }
  })

  let subProcessOfCheckAndDownloadDependencies: ChildProcess | null = null
  ipcMain.handle('setup-dependencies', async () => {
    if (subProcessOfCheckAndDownloadDependencies) {
      return
    }
    const subProcessEnv = {
      ...process.env,
      MAIN_BOSSGEEKGO_UI_RUN_MODE: 'checkAndDownloadDependenciesForInit'
    }
    subProcessOfCheckAndDownloadDependencies = childProcess.spawn(
      process.argv[0],
      process.argv.slice(1),
      {
        env: subProcessEnv,
        stdio: [null, null, null, 'pipe', 'ipc']
      }
    )
    return new Promise((resolve, reject) => {
      subProcessOfCheckAndDownloadDependencies!.stdio[3]!.pipe(JSONStream.parse()).on(
        'data',
        (raw) => {
          const data = raw
          switch (data.type) {
            case 'NEED_RESETUP_DEPENDENCIES':
            case 'PUPPETEER_DOWNLOAD_PROGRESS': {
              mainWindow?.webContents.send(data.type, data)
              break
            }
            case 'PUPPETEER_DOWNLOAD_ENCOUNTER_ERROR': {
              console.error(data)
              break
            }
            default: {
              return
            }
          }
        }
      )
      subProcessOfCheckAndDownloadDependencies!.once('exit', (exitCode) => {
        switch (exitCode) {
          case 0: {
            resolve(exitCode)
            break
          }
          default: {
            reject('PUPPETEER_DOWNLOAD_ENCOUNTER_ERROR')
            break
          }
        }
        subProcessOfCheckAndDownloadDependencies = null
      })
    })
  })

  ipcMain.handle('stop-geek-auto-start-chat-with-boss', async () => {
    mainWindow?.webContents.send('geek-auto-start-chat-with-boss-stopping')
    subProcessOfPuppeteer?.kill()
  })

  let subProcessOfBossZhipinLoginPageWithPreloadExtension: ChildProcess | null = null
  ipcMain.on('launch-bosszhipin-login-page-with-preload-extension', async () => {
    try {
      subProcessOfBossZhipinLoginPageWithPreloadExtension?.kill()
    } catch {
      //
    }
    const subProcessEnv = {
      ...process.env,
      MAIN_BOSSGEEKGO_UI_RUN_MODE: 'launchBossZhipinLoginPageWithPreloadExtension',
      PUPPETEER_EXECUTABLE_PATH: (await getAnyAvailablePuppeteerExecutable())!.executablePath
    }
    subProcessOfBossZhipinLoginPageWithPreloadExtension = childProcess.spawn(
      process.argv[0],
      process.argv.slice(1),
      {
        env: subProcessEnv,
        stdio: [null, null, null, 'pipe', 'ipc']
      }
    )
    subProcessOfBossZhipinLoginPageWithPreloadExtension!.stdio[3]!.pipe(JSONStream.parse()).on(
      'data',
      (raw) => {
        const data = raw
        switch (data.type) {
          case 'BOSS_ZHIPIN_COOKIE_COLLECTED': {
            mainWindow?.webContents.send(data.type, data)
            break
          }
          default: {
            return
          }
        }
      }
    )

    subProcessOfBossZhipinLoginPageWithPreloadExtension!.once('exit', () => {
      mainWindow?.webContents.send('BOSS_ZHIPIN_LOGIN_PAGE_CLOSED')
      subProcessOfBossZhipinLoginPageWithPreloadExtension = null
    })
  })
  ipcMain.on('kill-bosszhipin-login-page-with-preload-extension', async () => {
    try {
      subProcessOfBossZhipinLoginPageWithPreloadExtension?.kill()
    } catch {
      //
    } finally {
      subProcessOfBossZhipinLoginPageWithPreloadExtension = null
    }
  })

  ipcMain.handle('check-boss-zhipin-cookie-file', () => {
    const cookies = readStorageFile('boss-cookies.json')
    return checkCookieListFormat(cookies)
  })

  ipcMain.handle('get-auto-start-chat-record', async (ev, payload: PageReq) => {
    const a = await getAutoStartChatRecord(payload)
    return a
  })
  ipcMain.handle('get-job-library', async (ev, payload: PageReq) => {
    const a = await getJobLibrary(payload)
    return a
  })
  ipcMain.handle('get-boss-library', async (ev, payload: PageReq) => {
    const a = await getBossLibrary(payload)
    return a
  })
  ipcMain.handle('get-company-library', async (ev, payload: PageReq) => {
    const a = await getCompanyLibrary(payload)
    return a
  })

  let subProcessOfOpenBossSiteDefer: null | PromiseWithResolvers<ChildProcess> = null
  let subProcessOfOpenBossSite: null | ChildProcess = null
  ipcMain.handle('open-site-with-boss-cookie', async (_, data) => {
    const url = data.url
    if (
      !subProcessOfOpenBossSiteDefer ||
      !subProcessOfOpenBossSite ||
      subProcessOfOpenBossSite.killed
    ) {
      subProcessOfOpenBossSiteDefer = Promise.withResolvers()
      const puppeteerExecutable = await getAnyAvailablePuppeteerExecutable()
      const subProcessEnv = {
        ...process.env,
        MAIN_BOSSGEEKGO_UI_RUN_MODE: 'launchBossSite',
        PUPPETEER_EXECUTABLE_PATH: puppeteerExecutable!.executablePath
      }
      subProcessOfOpenBossSite = childProcess.spawn(process.argv[0], process.argv.slice(1), {
        env: subProcessEnv,
        stdio: [null, null, null, 'pipe']
      })
      subProcessOfOpenBossSite.once('exit', () => {
        subProcessOfOpenBossSiteDefer = null
      })
      subProcessOfOpenBossSite.stdio[3]!.pipe(JSONStream.parse()).on(
        'data',
        async function handler(data) {
          switch (data?.type) {
            case 'SUB_PROCESS_OF_OPEN_BOSS_SITE_READY': {
              subProcessOfOpenBossSiteDefer!.resolve(subProcessOfOpenBossSite as ChildProcess)
              break
            }
            case 'SUB_PROCESS_OF_OPEN_BOSS_SITE_CAN_BE_KILLED': {
              try {
                subProcessOfOpenBossSite &&
                  !subProcessOfOpenBossSite.killed &&
                  subProcessOfOpenBossSite.pid &&
                  process.kill(subProcessOfOpenBossSite.pid)
              } catch {
                //
              } finally {
                subProcessOfOpenBossSiteDefer = null
                subProcessOfOpenBossSite = null
              }
              break
            }
          }
        }
      )
    }

    await subProcessOfOpenBossSiteDefer.promise

    pipeWriteRegardlessError(
      subProcessOfOpenBossSite!.stdio[3]! as WriteStream,
      JSON.stringify({
        type: 'NEW_WINDOW',
        url: url ?? 'about:blank'
      })
    )
  })

  ipcMain.handle('exit-app-immediately', () => {
    app.exit(0)
  })
}
