const { app } = require('electron');
const { spawn } = require('child_process');

const isUiDev = process.env.NODE_ENV === 'development'

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
  async function startDaemon() {
    console.log('启动守护进程...');
    // 添加参数使守护进程在后台运行，不显示 UI
    daemonProcess = spawn(
      process.argv[0],
      isUiDev
        ? [process.argv[1], `--mode=launchDaemon`]
        : [`--mode=launchDaemon`],
      {
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        detached: false,
        env: {
          ...process.env,
        }
      }
    )

    daemonProcess.stdout.on('data', (data) => {
      console.log(`守护进程输出: ${data}`);
    });

    daemonProcess.stderr.on('data', (data) => {
      console.error(`守护进程错误: ${data}`);
    });

    return new Promise((resolve, reject) => {
      daemonProcess.stdio[3].on('data', (rawData) => {
        let data
        try {
          data = JSON.parse(rawData.toString())
          if (data.type === 'DAEMON_READY') {
            resolve(true)
          }
          else if (data.type === 'DAEMON_FATAL') {
            reject(new Error(data.error))
          }
        }
        catch (err) {
          console.error('', err)
        }
      })
    })
  }

  // 应用准备就绪
  return app.whenReady().then(() => startDaemon());
}

