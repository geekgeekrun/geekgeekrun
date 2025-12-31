const { app, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const split2 = require('split2');

const isUiDev = process.env.NODE_ENV === 'development'
const DAEMON_PORT = 12345;

export function launchDaemon() {
  let daemonProcess = null;

  // 所有窗口关闭时
  app.on('window-all-closed', () => {
    // if (process.platform !== 'darwin') {
    // 关闭守护进程
    if (daemonProcess) {
      daemonProcess.kill();
    }
    //   app.quit();
    // }
  });

  // 应用退出前清理
  app.on('before-quit', () => {
    if (daemonProcess) {
      daemonProcess.kill();
    }
  });

  // 启动守护进程
  function startDaemon() {
    console.log('启动守护进程...');
    // 使用 Electron 可执行程序路径，如果没有则回退到 node
    const electronPath = process.execPath;
    console.log(`使用 Electron 路径: ${electronPath}`);

    // 添加参数使守护进程在后台运行，不显示 UI
    daemonProcess = spawn(
      process.argv[0],
      isUiDev
        ? [process.argv[1], `--mode=launchDaemon`]
        : [`--mode=launchDaemon`],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: {
          ...process.env,
        }
      }
    )

    // daemonProcess = spawn(electronPath, [
    //     '--no-sandbox',
    //     '--disable-dev-shm-usage',
    //     path.join(__dirname, 'daemon.js')
    // ], {
    //     stdio: ['ignore', 'pipe', 'pipe'],
    //     detached: false,
    //     env: {
    //         ...process.env,
    //         ELECTRON_EXEC_PATH: electronPath // 传递给守护进程，用于启动 worker
    //     }
    // });

    daemonProcess.stdout.on('data', (data) => {
      console.log(`守护进程输出: ${data}`);
    });

    daemonProcess.stderr.on('data', (data) => {
      console.error(`守护进程错误: ${data}`);
    });

    daemonProcess.on('exit', (code) => {
      console.log(`守护进程退出，代码: ${code}`);
      // 如果守护进程意外退出，尝试重启
      if (code !== 0) {
        setTimeout(() => {
          console.log('尝试重启守护进程...');
          startDaemon();
        }, 2000);
      }
    });

    // 等待守护进程启动后连接
    setTimeout(() => {
      connectToDaemon();
    }, 1000);
  }

  // 应用准备就绪
  return app.whenReady().then(() => {
    startDaemon();
  });
}

export function connectToDaemon() {
  let daemonClient = null;
  // 连接到守护进程
  function _connectToDaemon() {
    daemonClient = new net.Socket();
    daemonClient.connect(DAEMON_PORT, 'localhost', () => {
      console.log('已连接到守护进程');
      // 通知渲染进程连接成功
      // if (mainWindow) {
      //     mainWindow.webContents.send('daemon-connected');
      // }
    });
    // 使用 split2 按行分割流式数据，处理 JSONL 格式（每行一个 JSON）
    const splitStream = split2();
    daemonClient.pipe(splitStream).on('data', (line) => {
      const trimmedLine = line.toString().trim();
      if (!trimmedLine) {
        return; // 跳过空行
      }
      try {
        const message = JSON.parse(trimmedLine);
        console.log('收到守护进程消息:', message);
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

    daemonClient.on('error', (err) => {
      console.error('守护进程连接错误:', err);
      // 尝试重连
      setTimeout(() => {
        if (daemonClient.destroyed) {
          _connectToDaemon();
        }
      }, 2000);
    });

    daemonClient.on('close', () => {
      console.log('守护进程连接已关闭');
      // 尝试重连
      setTimeout(() => {
        _connectToDaemon();
      }, 2000);
    });
  }

  // 向守护进程发送消息
  function sendToDaemon(message) {
    if (daemonClient && !daemonClient.destroyed) {
      daemonClient.write(JSON.stringify(message) + '\n');
    } else {
      console.error('守护进程未连接');
    }
  }

  // IPC处理：从渲染进程接收消息并转发到守护进程
  ipcMain.on('send-to-daemon', (event, message) => {
    sendToDaemon(message);
  });

  // IPC处理：启动工具进程
  ipcMain.on('start-worker', (event, workerId) => {
    sendToDaemon({ type: 'start-worker', workerId });
  });

  // IPC处理：停止工具进程
  ipcMain.on('stop-worker', (event, workerId) => {
    sendToDaemon({ type: 'stop-worker', workerId });
  });

  // IPC处理：获取所有工具进程状态
  ipcMain.on('get-workers-status', () => {
    sendToDaemon({ type: 'get-status' });
  });

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

  _connectToDaemon()
}
