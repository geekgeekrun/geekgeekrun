// 如果是通过 Electron 运行，禁用 GUI 和 Dock 图标
if (typeof require !== 'undefined') {
  try {
    const { app } = require('electron');
    if (app) {
      // 隐藏 Dock 图标
      if (process.platform === 'darwin') {
        app.dock?.hide();
      }
      
      // 防止显示窗口
      app.on('ready', () => {
        // 不创建任何窗口，保持后台运行
      });
      
      // 防止在没有窗口时退出
      app.on('window-all-closed', (e: Event) => {
        e.preventDefault();
        // 不退出应用，保持后台运行
      });
    }
  } catch (e) {
    // 不在 Electron 环境中，忽略
  }
}

import * as net from 'net';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// @ts-ignore
const split2: any = require('split2');

const ipcWritePipe = fs.createWriteStream(null, { fd: 3 });
let ipcSocketName = process.env.GEEKGEEKRUND_PIPE_NAME;
if (!ipcSocketName) {
  process.env.GEEKGEEKRUND_PIPE_NAME = `geekgeekrun-d_${randomUUID()}`;
  ipcSocketName = process.env.GEEKGEEKRUND_PIPE_NAME;
}
const ipcSocketPath = process.platform === 'win32'
    ? `\\\\.\\pipe\\${ipcSocketName}`
    : path.join(tmpdir(), `${ipcSocketName}.sock`);

interface WorkerInfo {
  process: ChildProcess;
  status: 'running' | 'stopped';
  startTime: number;
  restartCount: number;
  socket: net.Socket | null;
  latestScreenshot: string | null;
  latestScreenshotAt: number | null;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  workerId: string;
}

interface Message {
  type: string;
  workerId?: string;
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  data?: any;
  _callbackUuid?: string;
}

interface WorkerStatus {
  workerId: string;
  status: string;
  uptime: number;
  restartCount: number;
  command: string;
  args: string[];
  pid?: number;
  screenshot: string | null;
  screenshotAt: number | null;
}

interface Response {
  success?: boolean;
  message?: string;
  workerId?: string;
  error?: string;
  details?: string;
  workers?: WorkerStatus[];
  shouldExit?: boolean;
  data?: any;
  type?: string;
  code?: number | null;
  signal?: string | null;
  restarting?: boolean;
  restartCount?: number;
  timestamp?: number;
}

const workers = new Map<string, WorkerInfo>();
const userProcessClients = new Set<net.Socket>();
const stoppedWorkers = new Set<string>();
const pidToProcessInfoMap = new Map<number, WorkerInfo>();
const socketToWorkerIdSetMap = new WeakMap<net.Socket, Set<string>>();

const server = net.createServer((socket: net.Socket) => {
  console.log('客户端已连接');

  const splitStream = split2();
  
  socket.pipe(splitStream).on('data', (line: Buffer) => {
    const trimmedLine = line.toString().trim();
    if (!trimmedLine) {
      return;
    }
    
    let _callbackUuid: string | undefined;
    try {
      const message: Message = JSON.parse(trimmedLine);
      _callbackUuid = message._callbackUuid;
      handleMessage(socket, message);
    } catch (parseError: any) {
      console.error('解析JSON消息失败:', parseError.message);
      console.error('原始数据:', trimmedLine.substring(0, 100));
      sendResponse(socket, _callbackUuid || null, { error: '无效的JSON格式', details: parseError.message });
    }
  });

  splitStream.on('error', (err: Error) => {
    console.error('split2 流处理错误:', err);
    sendResponse(socket, null, { error: '流处理失败' });
  });

  socket.on('error', (err: Error) => {
    console.error('Socket错误:', err);
  });

  socket.on('close', () => {
    console.log('客户端已断开连接');
    userProcessClients.delete(socket);
    for (const [workerId, workerInfo] of workers.entries()) {
      if (workerInfo.socket === socket) {
        console.log(`工具进程 ${workerId} 的连接已断开`);
        workerInfo.socket = null;
      }
    }
    const workerIdSet = socketToWorkerIdSetMap.get(socket) || new Set<string>();
    [...workerIdSet].forEach(workerId => {
      stopWorker(workerId);
    });
  });
});

function handleMessage(socket: net.Socket, message: Message): void {
  console.log('收到消息:', message);
  const _callbackUuid = message._callbackUuid;
  
  if (message.type === 'ping') {
    sendResponse(socket, _callbackUuid || null, { success: true, message: 'pong' });
    return;
  }
  
  if (message.type === 'user-process-register') {
    if (!userProcessClients.has(socket)) {
      userProcessClients.add(socket);
    }
    sendResponse(socket, _callbackUuid || null, { success: true });
    return;
  }

  const workerId = message.workerId;
  const workerInfo = workerId ? workers.get(workerId) : undefined;
  
  switch (message.type) {
    case 'check-should-exit': {
      const checkWorkerId = message.workerId;
      if (!checkWorkerId) {
        sendResponse(socket, _callbackUuid || null, { error: '缺少 workerId' });
        return;
      }
      const shouldExit = stoppedWorkers.has(checkWorkerId) || !workers.has(checkWorkerId);
      sendResponse(socket, _callbackUuid || null, { workerId: checkWorkerId, shouldExit });
      if (shouldExit) {
        console.log(`工具进程 ${checkWorkerId} 查询是否应该退出，返回: 是`);
      }
      return;
    }
    
    case 'worker-to-gui-message': {
      if (workerId) {
        broadcastToGUI({
          type: 'worker-to-gui-message',
          workerId,
          data: message.data || message,
          timestamp: Date.now()
        });
      }
      return;
    }
    
    case 'worker-screenshot': {
      if (workerInfo && message.data && message.data.screenshot) {
        try {
          workerInfo.latestScreenshot = message.data.screenshot;
          workerInfo.latestScreenshotAt = Date.now();
        } catch (e) {
          console.error('缓存 worker 截图信息失败:', e);
        }
      }
      return;
    }

    case 'start-worker': {
      const { workerId: startWorkerId, command, args, env } = message;
      if (!startWorkerId || !command) {
        sendResponse(socket, _callbackUuid || null, { error: '缺少必要参数' });
        return;
      }
      if (workers.has(startWorkerId)) {
        console.log(`工具进程 ${startWorkerId} 已在运行`);
        return;
      }
      startWorker({ workerId: startWorkerId, command, args: args || [], env: env || {} });
      sendResponse(socket, _callbackUuid || null, { success: true, message: `工具进程 ${startWorkerId} 已启动`, workerId: startWorkerId });
      let socketToWorkerIdSet = socketToWorkerIdSetMap.get(socket);
      if (!(socketToWorkerIdSet instanceof Set)) {
        socketToWorkerIdSet = new Set<string>();
        socketToWorkerIdSetMap.set(socket, socketToWorkerIdSet);
      }
      socketToWorkerIdSet.add(startWorkerId);
      return;
    }

    case 'stop-worker': {
      if (!message.workerId) {
        sendResponse(socket, _callbackUuid || null, { error: '缺少 workerId' });
        return;
      }
      stopWorker(message.workerId);
      sendResponse(socket, _callbackUuid || null, { success: true, message: `工具进程 ${message.workerId} 已停止`, workerId: message.workerId });
      return;
    }

    case 'get-status': {
      const status = getWorkersStatus();
      sendResponse(socket, _callbackUuid || null, { success: true, workers: status });
      return;
    }

    default: {
      sendResponse(socket, _callbackUuid || null, { error: '未知的消息类型' });
    }
  }
}

interface StartWorkerOptions {
  workerId: string;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

function startWorker(options: StartWorkerOptions, restartCount: number = 0): void {
  const { workerId, command, args, env } = options;
  
  const noAutoRestartExitCodeSet = new Set<number>([0]);
  (env.GEEKGEEKRUND_NO_AUTO_RESTART_EXIT_CODE ?? '')
    .split(',')
    .map(n => parseInt(n))
    .filter(n => !isNaN(n))
    .forEach(n => noAutoRestartExitCodeSet.add(n));

  console.log(`启动工具进程: ${workerId}${restartCount > 0 ? ` (重启第${restartCount}次)` : ''}`);
  
  const workerProcess = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...env,
      GEEKGEEKRUND_WORKER_ID: workerId,
      GEEKGEEKRUND_RESTART_COUNT: restartCount.toString(),
    }
  });

  workerProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`工具进程 ${workerId} 输出:`, data.toString().trim());
  });

  workerProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`工具进程 ${workerId} 错误:`, data.toString().trim());
  });

  workerProcess.on('exit', (code: number | null, signal: string | null) => {
    console.log(`工具进程 ${workerId} 退出，代码: ${code}, 信号: ${signal}`);
    const workerInfo = workerProcess.pid ? pidToProcessInfoMap.get(workerProcess.pid) : undefined;
    
    if (workerInfo) {
      pidToProcessInfoMap.delete(workerProcess.pid!);
      if (workerInfo.socket) {
        workerInfo.socket.destroy();
      }
      
      const shouldRestart = code !== null && !noAutoRestartExitCodeSet.has(code);
      const newRestartCount = (workerInfo.restartCount || 0) + 1;
      
      workers.delete(workerId);
      
      broadcastToGUI({
        type: 'worker-exited',
        workerId,
        code,
        signal,
        restarting: shouldRestart && !stoppedWorkers.has(workerId),
        restartCount: newRestartCount
      });
      
      if (shouldRestart && !stoppedWorkers.has(workerId)) {
        console.log(`工具进程 ${workerId} 意外退出，准备重启 (第${newRestartCount}次)`);
        setTimeout(() => {
          if (!workers.has(workerId) && !stoppedWorkers.has(workerId)) {
            startWorker({ workerId, command, args, env }, newRestartCount);
          } else if (stoppedWorkers.has(workerId)) {
            console.log(`工具进程 ${workerId} 在重启前被标记为停止，取消重启`);
            stoppedWorkers.delete(workerId);
            broadcastToGUI({ type: 'worker-exited', workerId, code, signal, restarting: false, restartCount: newRestartCount });
          }
        }, 2000);
      } else if (stoppedWorkers.has(workerId)) {
        console.log(`工具进程 ${workerId} 已停止，清理停止标记`);
        stoppedWorkers.delete(workerId);
      }
    } else {
      if (stoppedWorkers.has(workerId)) {
        stoppedWorkers.delete(workerId);
      }
    }
  });

  workerProcess.on('error', (err: Error) => {
    console.log(err);
  });

  const workerInfo: WorkerInfo = {
    process: workerProcess,
    status: 'running',
    startTime: Date.now(),
    restartCount,
    socket: null,
    latestScreenshot: null,
    latestScreenshotAt: null,
    command,
    args,
    env,
    workerId,
  };
  
  workers.set(workerId, workerInfo);
  if (workerProcess.pid) {
    pidToProcessInfoMap.set(workerProcess.pid, workerInfo);
  }
  
  broadcastStatus();
}

function stopWorker(workerId: string): void {
  const workerInfo = workers.get(workerId);
  stoppedWorkers.add(workerId);
  console.log(`停止工具进程: ${workerId} (已添加到停止列表)`);
  
  if (!workerInfo) {
    console.log(`工具进程 ${workerId} 不存在，但已标记为停止（防止重启）`);
    broadcastToGUI({ type: 'worker-disconnected', workerId, message: `工具进程 ${workerId} 已停止` });
    setTimeout(() => broadcastStatus(), 500);
    return;
  }
  
  if (workerInfo.socket) {
    workerInfo.socket.destroy();
  }
  
  workerInfo.process.kill('SIGTERM');
  workers.delete(workerId);
  
  broadcastToGUI({ type: 'worker-disconnected', workerId, message: `工具进程 ${workerId} 已断开` });
  setTimeout(() => broadcastStatus(), 500);
}

function getWorkersStatus(): WorkerStatus[] {
  const status: WorkerStatus[] = [];
  for (const [workerId, workerInfo] of workers.entries()) {
    status.push({
      workerId,
      status: workerInfo.status,
      uptime: Date.now() - workerInfo.startTime,
      restartCount: workerInfo.restartCount || 0,
      command: workerInfo.command,
      args: workerInfo.args,
      pid: workerInfo.process?.pid,
      screenshot: workerInfo.latestScreenshot ?? null,
      screenshotAt: workerInfo.latestScreenshotAt ?? null,
    });
  }
  return status;
}

function broadcastStatus(): void {
  const status = getWorkersStatus();
  broadcastToGUI({ type: 'status', workers: status });
}

function broadcastToGUI(message: Response): void {
  userProcessClients.forEach(socket => {
    if (!socket.destroyed) {
      try {
        sendResponse(socket, null, message);
      } catch (e) {
        console.error('广播消息失败:', e);
        userProcessClients.delete(socket);
      }
    }
  });
}

function sendResponse(socket: net.Socket, _callbackUuid: string | null, response: Response): void {
  try {
    socket.write(JSON.stringify({ ...response, _callbackUuid }) + '\n');
  } catch (e) {
    console.error('发送响应失败:', e);
  }
}

new Promise<void>((resolve, reject) => {
  server.once('error', (err: Error) => {
    ipcWritePipe.write(JSON.stringify({ type: 'DAEMON_FATAL', error: err }), (err) => void err);
    reject(err);
  });
  
  server.listen(ipcSocketPath, () => {
    console.log(`守护进程服务器运行在端口 ${ipcSocketPath}`);
    ipcWritePipe.write(JSON.stringify({ type: 'DAEMON_READY' }), (err) => void err);
    resolve();
  });
});

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭所有工具进程...');
  for (const [, workerInfo] of workers.entries()) {
    workerInfo.process.kill('SIGTERM');
  }
  server.close(() => {
    console.log('守护进程已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭所有工具进程...');
  for (const [, workerInfo] of workers.entries()) {
    workerInfo.process.kill('SIGTERM');
  }
  server.close(() => {
    console.log('守护进程已关闭');
    process.exit(0);
  });
});
