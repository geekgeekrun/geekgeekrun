import { BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import * as childProcess from 'node:child_process'
import { is } from '@electron-toolkit/utils'
import {
  readConfigFile,
  configFileNameList,
  ensureConfigFileExist,
  writeConfigFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { ChildProcess } from 'child_process'
import * as JSONStream from 'JSONStream'
import {
  DOWNLOAD_ERROR_EXIT_CODE,
  getAnyAvailablePuppeteerExecutablePath
} from '../flow/CHECK_AND_DOWNLOAD_DEPENDENCIES'
let mainWindow: BrowserWindow | null = null

export function createMainWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux'
      ? {
          /* icon */
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  is.dev && mainWindow.webContents.openDevTools()

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  ipcMain.handle('fetch-config-file-content', async () => {
    const fileContentList = configFileNameList.map((fileName) => {
      return readConfigFile(fileName)
    })
    const result = {}

    configFileNameList.forEach((fileName, index) => {
      result[fileName] = fileContentList[index]
    })
    return result
  })

  ipcMain.handle('save-config-file-from-ui', async (ev, payload) => {
    payload = JSON.parse(payload)
    ensureConfigFileExist()

    const dingtalkConfig = readConfigFile('dingtalk.json')
    dingtalkConfig.groupRobotAccessToken = payload.dingtalkRobotAccessToken

    const bossZhipinConfig = readConfigFile('boss.json')
    bossZhipinConfig.cookies = JSON.parse(payload.bossZhipinCookies)

    return await Promise.all([
      writeConfigFile('boss.json', bossZhipinConfig),
      writeConfigFile('dingtalk.json', dingtalkConfig),
      writeConfigFile('target-company-list.json', payload.expectCompanies.split(','))
    ])
  })

  // const currentExecutablePath = app.getPath('exe')
  // console.log(currentExecutablePath)

  let subProcessOfPuppeteer: ChildProcess | null = null
  ipcMain.handle('run-geek-auto-start-chat-with-boss', async () => {
    if (subProcessOfPuppeteer) {
      return
    }

    const subProcessEnv = {
      ...process.env,
      MAIN_BOSSGEEKGO_UI_RUN_MODE: 'geekAutoStartWithBoss',
      PUPPETEER_EXECUTABLE_PATH: (await getAnyAvailablePuppeteerExecutablePath())!
    }
    subProcessOfPuppeteer = childProcess.spawn(process.argv[0], process.argv.slice(1), {
      env: subProcessEnv,
      stdio: [null, null, null, 'pipe', 'ipc']
    })
    console.log(subProcessOfPuppeteer)
    return new Promise((resolve, reject) => {
      subProcessOfPuppeteer!.stdio[3]!.pipe(JSONStream.parse()).on('data', (raw) => {
        const data = raw
        switch (data.type) {
          case 'GEEK_AUTO_START_CHAT_WITH_BOSS_STARTED': {
            resolve(data)
            break
          }
          default: {
            return
          }
        }
      })

      subProcessOfPuppeteer!.once('exit', (exitCode) => {
        subProcessOfPuppeteer = null
        if (exitCode === 1) {
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
    const [anyAvailablePuppeteerExecutablePath] = await Promise.all([
      getAnyAvailablePuppeteerExecutablePath()
    ])
    return {
      puppeteerExecutableAvailable: !!anyAvailablePuppeteerExecutablePath
    }
  })

  let subProcessOfCheckAndDownloadDependencies: ChildProcess | null = null
  ipcMain.handle('setup-dependencies', async () => {
    if (subProcessOfCheckAndDownloadDependencies) {
      return
    }
    const subProcessEnv = {
      ...process.env,
      MAIN_BOSSGEEKGO_UI_RUN_MODE: 'checkAndDownloadDependenciesForInit',
      PUPPETEER_EXECUTABLE_PATH: (await getAnyAvailablePuppeteerExecutablePath())!
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
            default: {
              return
            }
          }
        }
      )
      subProcessOfCheckAndDownloadDependencies!.once('exit', (exitCode) => {
        switch (exitCode) {
          case DOWNLOAD_ERROR_EXIT_CODE.NO_ERROR: {
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
    subProcessOfPuppeteer?.kill('SIGINT')
  })
  ipcMain.on('open-project-homepage-on-github', () => {
    shell.openExternal(`https://github.com/geekgeekrun`, {
      activate: true
    })
  })

  mainWindow!.once('closed', () => {
    mainWindow = null
  })
}
