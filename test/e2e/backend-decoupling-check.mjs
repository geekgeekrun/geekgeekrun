import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGgrClient } from '../../packages/ggr-client/index.mjs'
import { createBackendProcessManager } from '../../packages/ggrd/lib/backend-process.mjs'
import { createSupervisorApi, createSupervisorDiagnostics } from '../../packages/ggrd/lib/supervisor-api.mjs'
import { createSupervisorRpcServer } from '../../packages/ggrd/lib/rpc-server.mjs'
import { createVersionStore } from '../../packages/ggrd/lib/version-store.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const runtime = await fs.mkdtemp(path.join('/tmp', 'ggr-real-update-'))
const store = createVersionStore(runtime)
const backendSocket = path.join(runtime, 'run', 'backend.sock')
const supervisorSocket = path.join(runtime, 'run', 'supervisor.sock')
const serverSource = `import net from 'node:net';import fs from 'node:fs/promises';import path from 'node:path';const socket=process.env.GGR_BACKEND_SOCKET,version=process.env.GGR_BACKEND_VERSION,file=path.join(process.env.GGR_RUNTIME_DIR,'data.json');process.on('uncaughtException',e=>fs.writeFile(path.join(process.env.GGR_RUNTIME_DIR,'fixture-error.log'),e.stack).then(()=>process.exit(1)));const read=async()=>JSON.parse(await fs.readFile(file,'utf8').catch(()=>'{"config":{"theme":"night"},"records":[{"id":"record-1"}],"tasks":[]}'));const write=x=>fs.writeFile(file,JSON.stringify(x));await fs.mkdir(path.dirname(socket),{recursive:true});await fs.rm(socket,{force:true});const s=net.createServer(c=>{let b='';c.on('data',async x=>{try{b+=x;let n;while((n=b.indexOf('\\n'))>=0){const q=JSON.parse(b.slice(0,n));b=b.slice(n+1);let r;const d=await read();if(q.method==='system.handshake')r={protocolMin:1,protocolMax:1};else if(q.method==='system.health')r={ready:version!=='1.0.2',version};else if(q.method==='config.read')r=d.config;else if(q.method==='config.write'){d.config=q.params.value;await write(d);r={saved:true}}else if(q.method==='records.list')r=d.records;else if(q.method==='task.list')r=d.tasks;else if(q.method==='system.updateDrain')r={accepted:true};else r={};c.write(JSON.stringify({id:q.id,result:r})+'\\n')}}catch(e){await fs.writeFile(path.join(process.env.GGR_RUNTIME_DIR,'fixture-error.log'),e.stack);c.destroy()}})});s.listen(socket);for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>s.close(()=>process.exit(0)));`
const fixtureNode = path.join(root, 'packages/ui/resources/ggrd-bootstrap/runtime/bin/node')
async function stage(version) { await store.stage(version, async d => { await fs.mkdir(path.join(d, 'bin'), { recursive: true }); await fs.mkdir(path.join(d, 'app'), { recursive: true }); await fs.writeFile(path.join(d, 'bin/node'), `#!/bin/sh\nexec ${JSON.stringify(fixtureNode)} "$@"\n`, { mode: 0o755 }); await fs.writeFile(path.join(d, 'app/server.mjs'), serverSource) }) }
await stage('1.0.0'); await store.activate('1.0.0')
function client(socketPath, name) { return createGgrClient({ socketPath, client: name, clientVersion: '1.0.0', protocolVersion: 1, connectTimeoutMs: 2_000, requestTimeoutMs: 30_000 }) }
async function backendRequest(method, params = {}) { const c = client(backendSocket, 'supervisor'); await c.connect(); try { return await c.request(method, params) } finally { await c.close() } }
const manager = createBackendProcessManager({ versionStore: store, runtimeDir: runtime, backendSocketPath: backendSocket, supervisorPath: supervisorSocket, healthCheck: async () => { for (let attempt = 0; attempt < 50; attempt++) { try { return await backendRequest('system.health') } catch { await new Promise(resolve => setTimeout(resolve, 20)) } } throw Object.assign(new Error('candidate backend did not become ready'), { code: 'HEALTH_CHECK_FAILED' }) }, stopTimeoutMs: 2_000, killTimeoutMs: 2_000 })
const diagnostics = await createSupervisorDiagnostics({ filePath: path.join(runtime, 'logs/supervisor.jsonl') })
const api = createSupervisorApi({ versionStore: store, processManager: manager, backendClient: { request: backendRequest }, diagnostics, installer: async ({ manifest }) => { await stage(manifest.version); return { version: manifest.version } } })
const rpc = createSupervisorRpcServer({ socketPath: supervisorSocket, api, logger: diagnostics })
const electron = client(supervisorSocket, 'fake-electron'), mcp = client(supervisorSocket, 'fake-mcp')
let oldBackend
async function waitForBackend() { for (let attempt = 0; attempt < 50; attempt++) { try { return await backendRequest('system.health') } catch { await new Promise(resolve => setTimeout(resolve, 20)) } } throw new Error('temporary backend did not become ready') }
try {
  await rpc.start(); await manager.start(); await waitForBackend(); await Promise.all([electron.connect(), mcp.connect()])
  oldBackend = client(backendSocket, 'fake-electron'); const oldMcp = client(backendSocket, 'fake-mcp'); await Promise.all([oldBackend.connect(), oldMcp.connect()])
  assert.deepEqual(await oldBackend.request('config.read'), { theme: 'night' }); assert.deepEqual(await oldMcp.request('records.list'), [{ id: 'record-1' }]); assert.deepEqual(await oldBackend.request('task.list'), [])
  await oldBackend.request('config.write', { value: { theme: 'night', preserved: true } })
  await electron.request('update.install', { manifest: { version: '1.0.1' }, deadlineMs: 5_000 })
  await assert.rejects(oldBackend.request('system.health'), { code: 'CONNECTION_CLOSED' }); await oldMcp.close()
  await waitForBackend()
  let afterElectron = client(backendSocket, 'fake-electron'), afterMcp = client(backendSocket, 'fake-mcp'); await Promise.all([afterElectron.connect(), afterMcp.connect()])
  assert.equal((await afterElectron.request('system.health')).version, '1.0.1'); assert.equal((await afterMcp.request('system.health')).version, '1.0.1'); assert.deepEqual(await afterElectron.request('config.read'), { theme: 'night', preserved: true }); assert.deepEqual(await afterMcp.request('records.list'), [{ id: 'record-1' }]); assert.deepEqual(await afterMcp.request('task.list'), [])
  await assert.rejects(electron.request('update.install', { manifest: { version: '1.0.2' }, deadlineMs: 5_000 }), { code: 'INTERNAL_ERROR' }); await Promise.all([afterElectron.close(), afterMcp.close()]); await waitForBackend(); afterElectron = client(backendSocket, 'fake-electron'); afterMcp = client(backendSocket, 'fake-mcp'); await Promise.all([afterElectron.connect(), afterMcp.connect()])
  assert.equal((await afterElectron.request('system.health')).version, '1.0.1'); assert.equal(await store.current(), '1.0.1'); assert.deepEqual(await afterMcp.request('config.read'), { theme: 'night', preserved: true }); await Promise.all([afterElectron.close(), afterMcp.close()])
} finally { await Promise.allSettled([oldBackend?.close(), electron.close(), mcp.close()]); await manager.stop().catch(()=>{}); await rpc.stop(); console.error(await diagnostics.tail()); await diagnostics.close(); await fs.rm(runtime, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) }
console.log('backend decoupling e2e check passed')
