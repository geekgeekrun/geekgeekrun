// 如果是通过 Electron 运行，禁用 GUI 和 Dock 图标
if (typeof require !== 'undefined') {
  try {
    const { app } = require('electron');
    if (app) {
      // 隐藏 Dock 图标（macOS）
      if (process.platform === 'darwin') {
        app.dock?.hide();
      }
      
      // 防止显示窗口
      app.on('ready', () => {
        // 不创建任何窗口，保持后台运行
      });
      
      // 防止在没有窗口时退出
      app.on('window-all-closed', (e) => {
        e.preventDefault();
        // 不退出应用，保持后台运行
      });
    }
  } catch (e) {
    // 不在 Electron 环境中，忽略
  }
}

// 工具进程示例
const net = require('net');
const split2 = require('split2');

// 解析命令行参数
let workerId = 'unknown';
let restartCount = 0;
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--worker-id=')) {
    workerId = arg.split('=')[1] || 'unknown';
  } else if (arg.startsWith('--restart-count=')) {
    restartCount = parseInt(arg.split('=')[1] || '0', 10);
  }
}

console.log(`工具进程 ${workerId} 已启动 (PID: ${process.pid})${restartCount > 0 ? `，这是第${restartCount}次重启` : ''}`);

const DAEMON_PORT = 12345;
let daemonSocket = null;
let reconnectTimer = null;
let isShuttingDown = false;

// 连接到守护进程
function connectToDaemon() {
  if (isShuttingDown) return;
  
  daemonSocket = new net.Socket();
  
  daemonSocket.connect(DAEMON_PORT, 'localhost', () => {
    console.log(`[工具进程 ${workerId}] 已连接到守护进程`);
    
    // 注册工具进程连接
    sendToDaemon({
      type: 'worker-register',
      workerId: workerId
    });
    
    // 连接成功后立即检查是否应该退出
    setTimeout(() => {
      checkShouldIExit();
    }, 500);
  });

  // 使用 split2 按行分割流式数据，处理 JSONL 格式（每行一个 JSON）
  // split2 会自动处理 TCP 分包问题，确保每条完整的消息（以换行符结尾）才会触发
  const splitStream = split2();
  
  daemonSocket.pipe(splitStream).on('data', (line) => {
    const trimmedLine = line.toString().trim();
    if (!trimmedLine) {
      return; // 跳过空行
    }
    
    try {
      const message = JSON.parse(trimmedLine);
      handleDaemonMessage(message);
    } catch (parseError) {
      console.error(`[工具进程 ${workerId}] 解析JSON消息失败:`, parseError.message);
      console.error('原始数据:', trimmedLine.substring(0, 100)); // 只打印前100个字符
    }
  });

  splitStream.on('error', (err) => {
    console.error(`[工具进程 ${workerId}] split2 流处理错误:`, err);
  });

  daemonSocket.on('error', (err) => {
    console.error(`[工具进程 ${workerId}] 守护进程连接错误:`, err.message);
    daemonSocket = null;
    
    // 尝试重连（如果不是正在关闭）
    if (!isShuttingDown) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        console.log(`[工具进程 ${workerId}] 尝试重新连接守护进程...`);
        connectToDaemon();
      }, 2000);
    }
  });

  daemonSocket.on('close', () => {
    console.log(`[工具进程 ${workerId}] 守护进程连接已关闭`);
    daemonSocket = null;
    
    // 尝试重连（如果不是正在关闭）
    if (!isShuttingDown) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        console.log(`[工具进程 ${workerId}] 尝试重新连接守护进程...`);
        connectToDaemon();
      }, 2000);
    }
  });
}

// 发送消息到守护进程
function sendToDaemon(message) {
  if (daemonSocket && !daemonSocket.destroyed) {
    try {
      daemonSocket.write(JSON.stringify(message) + '\n');
    } catch (e) {
      console.error(`[工具进程 ${workerId}] 发送消息失败:`, e);
    }
  } else {
    console.warn(`[工具进程 ${workerId}] 守护进程未连接，消息已丢弃:`, message.type);
  }
}

// 处理守护进程消息
function handleDaemonMessage(message) {
  if (message.type === 'worker-registered') {
    console.log(`[工具进程 ${workerId}] 连接已注册到守护进程`);
  } else if (message.type === 'check-should-exit-response') {
    // 处理是否应该退出的查询响应
    if (message.shouldExit) {
      console.log(`[工具进程 ${workerId}] 守护进程指示应该退出，正在退出...`);
      shutdown();
    }
  } else if (message.error) {
    console.error(`[工具进程 ${workerId}] 守护进程错误:`, message.error);
    // 如果守护进程要求退出（例如：已被标记为停止）
    if (message.shouldExit) {
      console.log(`[工具进程 ${workerId}] 守护进程要求退出，正在退出...`);
      shutdown();
    }
  }
}

// 检查是否应该退出
function checkShouldIExit() {
  if (isShuttingDown) return;
  
  if (!daemonSocket || daemonSocket.destroyed) {
    // 如果守护进程未连接，暂时不检查，等待重连
    return;
  }
  
  sendToDaemon({
    type: 'check-should-exit',
    workerId: workerId
  });
}

// 初始连接
connectToDaemon();

// 模拟工作负载
let counter = 0;
const interval = setInterval(() => {
  counter++;
  console.log(`[工具进程 ${workerId}] 运行中... 计数: ${counter}`);
  
  // 发送工作数据到守护进程
  sendToDaemon({
    type: 'worker-data',
    workerId: workerId,
    data: {
      counter: counter,
      timestamp: Date.now(),
      message: `工具进程 ${workerId} 工作数据`
    }
  });
  
  // 模拟随机错误（用于测试自动重启功能）
  // 取消下面的注释来测试自动重启
  // if (Math.random() < 0.001) {
  //   console.error(`[工具进程 ${workerId}] 模拟错误，退出`);
  //   process.exit(1);
  // }
}, 2000);

// 处理退出信号
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  clearInterval(interval);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  
  if (daemonSocket && !daemonSocket.destroyed) {
    daemonSocket.destroy();
  }
  
  console.log(`[工具进程 ${workerId}] 正在退出...`);
  process.exit(0);
}

process.on('SIGTERM', () => {
  console.log(`[工具进程 ${workerId}] 收到SIGTERM信号，正在退出...`);
  shutdown();
});

process.on('SIGINT', () => {
  console.log(`[工具进程 ${workerId}] 收到SIGINT信号，正在退出...`);
  shutdown();
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error(`[工具进程 ${workerId}] 未捕获的异常:`, error);
  clearInterval(interval);
  if (daemonSocket && !daemonSocket.destroyed) {
    daemonSocket.destroy();
  }
  process.exit(1);
});

// 定期发送心跳到守护进程，并检查是否应该退出
setInterval(() => {
  sendToDaemon({
    type: 'worker-heartbeat',
    workerId: workerId,
    timestamp: Date.now()
  });
  // 每次心跳时也检查是否应该退出
  checkShouldIExit();
}, 5000);
