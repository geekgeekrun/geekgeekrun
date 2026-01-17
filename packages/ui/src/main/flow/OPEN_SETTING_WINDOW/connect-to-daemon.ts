import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";

const net = require('net');
const split2 = require('split2');
const { app } = require('electron');

let daemonClient = null;
export const daemonEE = new EventEmitter()
const waitForCallbackTaskMap = new Map()

// 连接到守护进程
export async function connectToDaemon() {
  daemonClient = new net.Socket();
  let isConnected = false
  await new Promise((resolve, reject) => {
    const ipcSocketName = process.env.GEEKGEEKRUND_PIPE_NAME
    const ipcSocketPath = process.platform === 'win32' 
      ? `\\\\.\\pipe\\${ipcSocketName}`
      : path.join(tmpdir(), `${ipcSocketName}.sock`)
    daemonClient.connect(ipcSocketPath, 'localhost', () => {
      isConnected = true
      console.log('已连接到守护进程');
      daemonEE.emit('connect')
      // 使用 split2 按行分割流式数据，处理 JSONL 格式（每行一个 JSON）
      const splitStream = split2();
      daemonClient.pipe(splitStream).on('data', (line) => {
        const trimmedLine = line.toString().trim();
        if (!trimmedLine) {
          return; // 跳过空行
        }
        try {
          const message = JSON.parse(trimmedLine);
          daemonEE.emit('message', message)
          // FIXME:
          console.log('收到守护进程消息:', message);
          if (message._callbackUuid) {
            const callbackInfo = waitForCallbackTaskMap.get(message._callbackUuid)
            if (callbackInfo) {
              const isError = message._isError
              if (isError) {
                callbackInfo.reject(message)
              } else {
                callbackInfo.resolve(message)
              }
              waitForCallbackTaskMap.delete(message._callbackUuid)
            }
          }
          // 转发消息到渲染进程
          // if (mainWindow) {
          //     mainWindow.webContents.send('daemon-message', message);
          // }
        } catch (parseError) {
          console.error('解析守护进程消息失败:', parseError.message);
          console.error('原始数据:', trimmedLine.substring(0, 100));
        }
      });

      splitStream.on('error', (err) => {
        console.error('split2 流处理错误:', err);
      });

      daemonClient.on('close', () => {
        if (!isConnected) {
          return
        }
        console.log('守护进程连接已关闭');
        daemonEE.emit('close')
      });

      resolve(true)
      // 通知渲染进程连接成功
      // if (mainWindow) {
      //     mainWindow.webContents.send('daemon-connected');
      // }
    });

    daemonClient.on('close', () => {
      if (isConnected) {
        return
      }
      reject(new Error('连接到守护进程超时'))
    });
    daemonClient.on('error', (err) => {
      console.error('守护进程连接错误:', err);
      daemonEE.emit('error', err)
      reject(err)
    });
  })
}

// 向守护进程发送消息
export function sendToDaemon(message, {
  needCallback = false,
  timeout = undefined
} = {}) {
  const _callbackUuid = randomUUID()
  if (daemonClient && !daemonClient.destroyed) {
    daemonClient.write(JSON.stringify({
      ...message,
      _callbackUuid
    }) + '\n');
    if (needCallback) {
      let resolve, reject
      const promise = new Promise((_resolve, _reject) => {
        resolve = _resolve
        reject = _reject
      })
      waitForCallbackTaskMap.set(_callbackUuid, { resolve, reject })
      promise.finally(() => waitForCallbackTaskMap.delete(_callbackUuid))
      let timeoutTimer
      if (!isNaN(parseInt(timeout))) {
        timeoutTimer = setTimeout(() => {
          reject(new Error(`Callback timeout after ${timeout}ms`))
        }, timeout)
      }
      promise.finally(() => {
        clearTimeout(timeoutTimer)
      })
      return promise
    }
  } else {
    console.error('守护进程未连接');
  }
  return undefined
}

// // IPC处理：从渲染进程接收消息并转发到守护进程
// ipcMain.on('send-to-daemon', (event, message) => {
//   sendToDaemon(message);
// });

// // IPC处理：启动工具进程
// ipcMain.on('start-worker', (event, { workerId, command, args, env }) => {
//   sendToDaemon({ type: 'start-worker', workerId, command, args, env });
// });

app.on('window-all-closed', () => {
  if (daemonClient) {
    daemonClient.destroy();
  }
});

app.on('before-quit', () => {
  if (daemonClient) {
    daemonClient.destroy();
  }
});
