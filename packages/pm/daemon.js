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

const net = require('net');
const { spawn } = require('child_process');
const path = require('path');
const split2 = require('split2');

const PORT = 12345;
const workers = new Map(); // workerId -> { process, status, restartCount, socket }
const guiClients = new Set(); // GUI客户端连接集合
const stoppedWorkers = new Set(); // 被用户主动停止的workerId集合，用于防止竞态条件

// 创建TCP服务器
const server = net.createServer((socket) => {
  console.log('客户端已连接');

  // 使用 split2 按行分割流式数据，处理 JSONL 格式（每行一个 JSON）
  // split2 会自动处理 TCP 分包问题，确保每条完整的消息（以换行符结尾）才会触发
  const splitStream = split2();
  
  socket.pipe(splitStream).on('data', (line) => {
    const trimmedLine = line.toString().trim();
    if (!trimmedLine) {
      return; // 跳过空行
    }
    
    let _callbackUuid
    try {
      const message = JSON.parse(trimmedLine);
      _callbackUuid = message._callbackUuid
      handleMessage(socket, message);
    } catch (parseError) {
      console.error('解析JSON消息失败:', parseError.message);
      console.error('原始数据:', trimmedLine.substring(0, 100)); // 只打印前100个字符
      sendResponse(socket, _callbackUuid, { error: '无效的JSON格式', details: parseError.message });
    }
  });

  splitStream.on('error', (err) => {
    console.error('split2 流处理错误:', err);
    sendResponse(socket, null, { error: '流处理失败' });
  });

  socket.on('error', (err) => {
    console.error('Socket错误:', err);
  });

  socket.on('close', () => {
    console.log('客户端已断开连接');
    // 清理GUI客户端连接
    guiClients.delete(socket);
    // 清理工具进程连接
    for (const [workerId, workerInfo] of workers.entries()) {
      if (workerInfo.socket === socket) {
        console.log(`工具进程 ${workerId} 的连接已断开`);
        workerInfo.socket = null;
      }
    }
  });
});

// 处理消息
function handleMessage(socket, message) {
  console.log('收到消息:', message);
  const _callbackUuid = message._callbackUuid

  // 工具进程注册消息
  if (message.type === 'worker-register') {
    const workerId = message.workerId;
    
    // 检查是否在停止列表中（防止竞态条件）
    if (stoppedWorkers.has(workerId)) {
      console.log(`工具进程 ${workerId} 尝试注册，但已被标记为停止，拒绝注册`);
      sendResponse(socket, _callbackUuid, { 
        error: `工具进程 ${workerId} 已被停止`,
        shouldExit: true // 通知子进程应该退出
      });
      return;
    }
    
    const workerInfo = workers.get(workerId);
    if (workerInfo) {
      workerInfo.socket = socket;
      console.log(`工具进程 ${workerId} 已注册TCP连接`);
      sendResponse(socket, _callbackUuid, { 
        success: true, 
        type: 'worker-registered',
        message: `工具进程 ${workerId} 连接已注册`
      });
      // 通知GUI客户端
      broadcastToGUI({
        type: 'worker-connected',
        workerId: workerId,
        message: `工具进程 ${workerId} 已连接`
      });
    } else {
      // 如果workerInfo不存在，但不在停止列表中，可能是进程启动但还未完全初始化
      // 这种情况下也拒绝注册，让进程退出
      if (!stoppedWorkers.has(workerId)) {
        console.log(`工具进程 ${workerId} 尝试注册，但workerInfo不存在`);
      }
      sendResponse(socket, _callbackUuid, { 
        error: `工具进程 ${workerId} 未找到`,
        shouldExit: true
      });
    }
    return;
  }

  // 工具进程查询是否应该退出
  if (message.type === 'check-should-exit') {
    const workerId = message.workerId;
    const shouldExit = stoppedWorkers.has(workerId) || !workers.has(workerId);
    
    sendResponse(socket, _callbackUuid, {
      type: 'check-should-exit-response',
      workerId: workerId,
      shouldExit: shouldExit
    });
    
    if (shouldExit) {
      console.log(`工具进程 ${workerId} 查询是否应该退出，返回: 是`);
    }
    return;
  }

  // 工具进程发送的消息（数据、心跳等）
  if (message.type === 'worker-message' || message.type === 'worker-heartbeat' || message.type === 'worker-data') {
    const workerId = message.workerId;
    const workerInfo = workers.get(workerId);
    
    if (workerInfo && workerInfo.socket === socket) {
      // 转发工具进程消息到GUI客户端
      broadcastToGUI({
        type: 'worker-message',
        workerId: workerId,
        data: message.data || message,
        timestamp: Date.now()
      });
      
      // 如果是心跳，更新最后心跳时间
      if (message.type === 'worker-heartbeat') {
        workerInfo.lastHeartbeat = Date.now();
      }
    } else {
      sendResponse(socket, _callbackUuid, { error: '未注册的工具进程连接' });
    }
    return;
  }

  // GUI客户端的控制消息
  // 标记为GUI客户端
  if (!guiClients.has(socket)) {
    guiClients.add(socket);
  }

  switch (message.type) {
    case 'start-worker':
      const {
        workerId,
        command,
        args,
        env
      } = message
      startWorker({
        workerId,
        command,
        args,
        env
      });
      sendResponse(socket, _callbackUuid, {
        success: true, 
        message: `工具进程 ${message.workerId} 已启动`,
        workerId: message.workerId 
      });
      break;

    case 'stop-worker':
      stopWorker(message.workerId);
      sendResponse(socket, _callbackUuid, { 
        success: true, 
        message: `工具进程 ${message.workerId} 已停止`,
        workerId: message.workerId 
      });
      break;

    case 'get-status':
      const status = getWorkersStatus();
      sendResponse(socket, _callbackUuid, { 
        success: true, 
        type: 'status',
        workers: status 
      });
      break;

    default:
      sendResponse(socket, _callbackUuid, { error: '未知的消息类型' });
  }
}

// 启动工具进程
function startWorker({ workerId, command, args, env }, restartCount = 0) {
  if (workers.has(workerId)) {
    console.log(`工具进程 ${workerId} 已在运行`);
    return;
  }

  console.log(`启动工具进程: ${workerId}${restartCount > 0 ? ` (重启第${restartCount}次)` : ''}`);
  // 添加参数使工具进程在后台运行，不显示 UI
  const workerProcess = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...env,
      GEEKGEEKRUND_WORKER_ID: workerId,
      GEEKGEEKRUND_RESTART_COUNT: restartCount.toString(),
    }
  });

  let output = '';
  workerProcess.stdout.on('data', (data) => {
    output += data.toString();
    console.log(`工具进程 ${workerId} 输出:`, data.toString().trim());
  });

  workerProcess.stderr.on('data', (data) => {
    console.error(`工具进程 ${workerId} 错误:`, data.toString().trim());
  });

  workerProcess.on('exit', (code, signal) => {
    console.log(`工具进程 ${workerId} 退出，代码: ${code}, 信号: ${signal}`);
    
    const workerInfo = workers.get(workerId);
    if (workerInfo) {
      // 关闭工具进程的TCP连接
      if (workerInfo.socket) {
        workerInfo.socket.destroy();
      }
      
      const shouldRestart = code !== 0 // && code !== null;
      // 使用当前的 restartCount 加1，而不是从 workerInfo 中取（因为可能已经被删除）
      const restartCount = (workerInfo.restartCount || 0) + 1;
      
      workers.delete(workerId);
      
      // 通知GUI客户端工具进程已退出
      broadcastToGUI({
        type: 'worker-exited',
        workerId: workerId,
        code: code,
        signal: signal,
        restarting: shouldRestart && !stoppedWorkers.has(workerId),
        restartCount: restartCount
      });
      
      // 如果进程意外退出（非正常停止），且不在停止列表中，自动重启
      if (shouldRestart && !stoppedWorkers.has(workerId)) {
        console.log(`工具进程 ${workerId} 意外退出，准备重启 (第${restartCount}次)`);
        
        // 延迟重启，避免频繁重启
        setTimeout(() => {
          // 再次检查：确保worker不在停止列表中，且当前没有运行
          if (!workers.has(workerId) && !stoppedWorkers.has(workerId)) {
            startWorker({ workerId, command, args, env }, restartCount);
          } else if (stoppedWorkers.has(workerId)) {
            console.log(`工具进程 ${workerId} 在重启前被标记为停止，取消重启`);
            // 从停止列表中移除，因为已经处理完毕
            stoppedWorkers.delete(workerId);
          }
        }, 2000);
      } else if (stoppedWorkers.has(workerId)) {
        // 如果是在停止列表中，清理标记
        console.log(`工具进程 ${workerId} 已停止，清理停止标记`);
        stoppedWorkers.delete(workerId);
      }
    } else {
      // 如果workerInfo不存在，可能是已经被stopWorker删除
      // 检查停止列表，如果在则清理
      if (stoppedWorkers.has(workerId)) {
        stoppedWorkers.delete(workerId);
      }
    }
  });

  workerProcess.on('error', (err) => {
    console.log(err)
  })

  workers.set(workerId, {
    process: workerProcess,
    status: 'running',
    startTime: Date.now(),
    restartCount, // 使用传入的重启次数
    socket: null, // 工具进程的TCP连接，稍后由工具进程注册
    lastHeartbeat: null,
    command,
    env,
    workerId,
  });

  // 定期发送状态更新
  broadcastStatus();
}

// 停止工具进程
function stopWorker(workerId) {
  const workerInfo = workers.get(workerId);
  
  // 无论workerInfo是否存在，都添加到停止列表，防止竞态条件
  stoppedWorkers.add(workerId);
  console.log(`停止工具进程: ${workerId} (已添加到停止列表)`);
  
  if (!workerInfo) {
    console.log(`工具进程 ${workerId} 不存在，但已标记为停止（防止重启）`);
    // 通知GUI客户端
    broadcastToGUI({
      type: 'worker-disconnected',
      workerId: workerId,
      message: `工具进程 ${workerId} 已停止`
    });
    // 延迟发送状态更新
    setTimeout(() => broadcastStatus(), 500);
    return;
  }
  
  // 关闭工具进程的TCP连接
  if (workerInfo.socket) {
    workerInfo.socket.destroy();
  }
  
  workerInfo.process.kill('SIGTERM');
  workers.delete(workerId);
  
  // 通知GUI客户端
  broadcastToGUI({
    type: 'worker-disconnected',
    workerId: workerId,
    message: `工具进程 ${workerId} 已断开`
  });
  
  // 延迟发送状态更新
  setTimeout(() => broadcastStatus(), 500);
}

// 获取所有工具进程状态
function getWorkersStatus() {
  const status = [];
  for (const [workerId, workerInfo] of workers.entries()) {
    status.push({
      workerId,
      status: workerInfo.status,
      uptime: Date.now() - workerInfo.startTime,
      restartCount: workerInfo.restartCount || 0,
      connected: workerInfo.socket !== null && !workerInfo.socket.destroyed,
      lastHeartbeat: workerInfo.lastHeartbeat
    });
  }
  return status;
}

// 广播状态更新给所有GUI客户端
function broadcastStatus() {
  const status = getWorkersStatus();
  broadcastToGUI({
    type: 'status',
    workers: status
  });
}

// 广播消息给所有GUI客户端
function broadcastToGUI(message) {
  guiClients.forEach(socket => {
    if (!socket.destroyed) {
      try {
        sendResponse(socket, null, message);
      } catch (e) {
        console.error('广播消息失败:', e);
        guiClients.delete(socket);
      }
    }
  });
}

// 发送响应
function sendResponse(socket, _callbackUuid, response) {
  try {
    socket.write(JSON.stringify({
      ...response,
      _callbackUuid
    }) + '\n');
  } catch (e) {
    console.error('发送响应失败:', e);
  }
}

// 启动服务器
server.listen(PORT, () => {
  console.log(`守护进程服务器运行在端口 ${PORT}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭所有工具进程...');
  for (const [workerId, workerInfo] of workers.entries()) {
    workerInfo.process.kill('SIGTERM');
  }
  server.close(() => {
    console.log('守护进程已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭所有工具进程...');
  for (const [workerId, workerInfo] of workers.entries()) {
    workerInfo.process.kill('SIGTERM');
  }
  server.close(() => {
    console.log('守护进程已关闭');
    process.exit(0);
  });
});
