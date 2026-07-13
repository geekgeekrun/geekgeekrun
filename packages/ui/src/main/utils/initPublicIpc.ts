import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import gtag from './gtag'
import buildInfo from '../../common/build-info.json'
import os from 'node:os'
import fs from 'node:fs'
import { readBackendConfig, writeBackendConfig } from '../backend/register-ipc'

export default function initPublicIpc() {
  ipcMain.on(
    'update-window-size',
    (
      ev,
      size: {
        width: number
        height: number
        animate?: boolean
      }
    ) => {
      const win = BrowserWindow.fromWebContents(ev.sender)
      if (!win) {
        return
      }
      win.setMinimumSize(size.width, size.height)
      win.setSize(size.width, size.height, size.animate)
    }
  )
  ipcMain.on('open-external-link', (_, link) => {
    shell.openExternal(link, {
      activate: true
    })
  })
  ipcMain.on('gtag', (_ev, { name, params } = {}) => {
    gtag(name, {
      ...params,
      electron_log_source: 'renderer'
    })
  })
  ipcMain.on('send-feed-back-to-github-issue', () => {
    const getIssueUrlWithBody = (issueBody: string = '') => {
      const baseUrl = `https://github.com/geekgeekrun/geekgeekrun/issues/new`
      issueBody = issueBody || ''
      if (!issueBody || !issueBody.trim()) {
        return baseUrl
      }
      const urlObj = new URL(baseUrl)
      urlObj.searchParams.append('body', issueBody)

      return urlObj.toString()
    }

    shell.openExternal(
      getIssueUrlWithBody(`\n\n\n-----
版本号：${buildInfo.version}(${buildInfo.buildVersion})
提交：${buildInfo.buildHash.substring(0, 6)}
操作系统信息: \`${os.type()}\` / \`${os.release()}\` / \`${os.arch()}\``),
      {
        activate: true
      }
    )
  })

  ipcMain.handle('read-storage-file', async (_ev, payload) => {
    throw Object.assign(
      new Error(`Raw storage reads are not available: ${payload?.fileName}`),
      { code: 'METHOD_NOT_FOUND' }
    )
  })

  ipcMain.handle('get-boss-session-status', async () => {
    return await readBackendConfig('boss_cookies')
  })

  ipcMain.handle('write-storage-file', async (_ev, payload) => {
    if (payload?.fileName !== 'boss-cookies.json') {
      throw Object.assign(new Error(`Unsupported storage resource: ${payload?.fileName}`), { code: 'INVALID_PARAMS' })
    }
    return await writeBackendConfig('boss_cookies', JSON.parse(payload.data))
  })
  ipcMain.handle('get-os-platform', () => {
    return os.platform()
  })
  ipcMain.handle('choose-file', (ev, { fileChooserConfig }) => {
    if (!fileChooserConfig) {
      fileChooserConfig = {}
    }
    const win = BrowserWindow.fromWebContents(ev.sender)
    if (!win) {
      return dialog.showOpenDialog(fileChooserConfig)
    } else {
      return dialog.showOpenDialog(win, fileChooserConfig)
    }
  })
  ipcMain.handle('check-executable-file', (_ev, filePath: string) => {
    if (!filePath?.trim()) {
      return {
        message: '文件名无效'
      }
    }
    if (!fs.existsSync(filePath)) {
      return {
        message: '文件不存在'
      }
    }
    if (!fs.statSync(filePath).isFile()) {
      const messageSeg = ['文件不是可执行文件']
      if (os.platform() === 'darwin') {
        messageSeg.push(
          'macOS 平台，可执行文件位于“App包.app/Contents/MacOS/ 文件夹下”，而不是“App包.app”文件夹整体'
        )
      }
      return {
        message: messageSeg.join('；')
      }
    }
    return null
  })

}
