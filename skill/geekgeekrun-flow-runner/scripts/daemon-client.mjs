import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function getSocketPath(socketName) {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\${socketName}`
    : path.join(os.tmpdir(), `${socketName}.sock`);
}

function getPipeName() {
  const pipeFile = path.join(os.homedir(), '.geekgeekrun', 'storage', 'ipc-pipe-name');
  if (!fs.existsSync(pipeFile)) {
    throw new Error(`ipc pipe file not found: ${pipeFile}`);
  }
  const pipeName = fs.readFileSync(pipeFile, 'utf8').trim();
  if (!pipeName) {
    throw new Error(`ipc pipe file is empty: ${pipeFile}`);
  }
  return pipeName;
}

async function request(message, timeoutMs = 8000) {
  const callbackUuid = randomUUID();
  const socketPath = getSocketPath(getPipeName());

  return await new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn(value);
    };

    const timer = setTimeout(() => {
      finish(reject, new Error(`daemon request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.on('error', (err) => {
      finish(reject, err);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\n')) {
        const idx = buffer.indexOf('\n');
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch (err) {
          finish(reject, err);
          return;
        }
        if (parsed._callbackUuid !== callbackUuid) {
          continue;
        }
        if (parsed._isError) {
          finish(reject, new Error(parsed.error ?? 'daemon returned error'));
          return;
        }
        finish(resolve, parsed);
        return;
      }
    });

    socket.connect(socketPath, 'localhost', () => {
      socket.write(JSON.stringify({ ...message, _callbackUuid: callbackUuid }) + '\n');
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const timeoutFlagIndex = argv.findIndex((item) => item === '--timeout-ms');
  let timeoutMs = 8000;
  if (timeoutFlagIndex >= 0) {
    const rawTimeout = argv[timeoutFlagIndex + 1];
    const parsedTimeout = Number.parseInt(rawTimeout ?? '', 10);
    if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
      throw new Error(`invalid --timeout-ms value: ${rawTimeout}`);
    }
    timeoutMs = parsedTimeout;
    argv.splice(timeoutFlagIndex, 2);
  }

  const [command, arg] = argv;
  if (!command) {
    throw new Error('usage: node daemon-client.mjs [--timeout-ms N] <ping|get-status|stop-worker> [workerId]');
  }

  let message;
  switch (command) {
    case 'ping':
      message = { type: 'ping' };
      break;
    case 'get-status':
      message = { type: 'get-status' };
      break;
    case 'stop-worker':
      if (!arg) {
        throw new Error('stop-worker requires workerId');
      }
      message = { type: 'stop-worker', workerId: arg };
      break;
    default:
      throw new Error(`unsupported command: ${command}`);
  }

  const result = await request(message, timeoutMs);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? String(err));
  process.exit(1);
});
