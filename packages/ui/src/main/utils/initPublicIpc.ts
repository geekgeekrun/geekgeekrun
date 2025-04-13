import { BrowserWindow, ipcMain, shell } from 'electron'
import gtag from './gtag'
import buildInfo from '../../common/build-info.json'
import os from 'node:os'

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
      win.setSize(size.width, size.height, size.animate)
    }
  )
  ipcMain.on('open-external-link', (_, link) => {
    shell.openExternal(link, {
      activate: true
    })
  })
  ipcMain.on('gtag', (ev, { name, params } = {}) => {
    gtag(name, {
      ...params,
      electronLogSource: 'renderer'
    })
  })
  ipcMain.on('send-feed-back-to-github-issue', (ev, payload) => {
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
}
