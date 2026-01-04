import { connectToDaemon } from "./connect-to-daemon";

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

