import { spawn } from 'child_process'
import {
  ensureStorageFileExist,
  writeStorageFile,
  readStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { randomUUID } from 'node:crypto'
import { connectToDaemon } from './connect-to-daemon'

const isUiDev = process.env.NODE_ENV === 'development'
export async function ensureIpcPipeName() {
  let ipcPipeName = readStorageFile('ipc-pipe-name', { isJson: false })
  if (!ipcPipeName) {
    ipcPipeName = `geekgeekrun-d_${randomUUID()}`
    ensureStorageFileExist()
    await writeStorageFile('ipc-pipe-name', ipcPipeName, { isJson: false })
  }
  process.env.GEEKGEEKRUND_PIPE_NAME = ipcPipeName
  return ipcPipeName
}

export async function launchDaemon() {
  async function startDaemon() {
    console.log('启动守护进程...')
    // 添加参数使守护进程在后台运行，不显示 UI
    const daemonProcess = spawn(
      process.argv[0],
      isUiDev ? [process.argv[1], `--mode=launchDaemon`] : [`--mode=launchDaemon`],
      {
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        detached: true,
        env: {
          ...process.env
        }
      }
    )

    daemonProcess.stdout.on('data', (data) => {
      console.log(`守护进程输出: ${data}`)
    })

    daemonProcess.stderr.on('data', (data) => {
      console.error(`守护进程错误: ${data}`)
    })

    return new Promise((resolve, reject) => {
      daemonProcess.stdio[3].on('data', (rawData) => {
        let data
        try {
          data = JSON.parse(rawData.toString())
          if (data.type === 'DAEMON_READY') {
            resolve(true)
          } else if (data.type === 'DAEMON_FATAL') {
            reject(new Error(data.error))
          }
        } catch (err) {
          console.error('', err)
        }
      })
    })
  }
  try {
    await connectToDaemon()
  } catch (err) {
    // 启动守护进程
    await startDaemon()
    await connectToDaemon()
  }
}
