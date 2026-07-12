import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8')
}

const traySource = await read('packages/ui/src/main/features/tray.ts')
assert.match(traySource, /import\s+\{[^}]*Tray[^}]*\}\s+from ['"]electron['"]/, 'tray feature must import Electron Tray')
assert.match(traySource, /new\s+Tray\(/, 'tray feature must create a Tray instance')
assert.match(traySource, /setContextMenu\(/, 'tray feature must expose a context menu')
assert.match(traySource, /createDaemonController/, 'tray must use the shared daemon controller')
assert.match(traySource, /TASKS\.AUTO_CHAT\.workerId/, 'tray must use shared task constants')
assert.match(traySource, /controller\.stopTask\(/, 'tray must stop auto chat through the shared controller')
assert.match(traySource, /controller\.getTaskStatus\(/, 'tray must read status through the shared controller')
assert.match(traySource, /readApprovalQueue/, 'tray must read pending approval replies')
assert.match(traySource, /approveAutoReply/, 'tray must approve AI auto replies through the controller')
assert.match(traySource, /requireHumanIntervention/, 'tray must mark queued replies as human intervention through the controller')
assert.match(traySource, /AI 自动回复审批/, 'tray must expose an AI auto-reply approval queue entry')
assert.match(traySource, /daemonEE\.on\(['"]message['"]/, 'tray must subscribe to daemon events')
assert.match(traySource, /message\.type\s*===\s*['"]status['"]/, 'tray must update from daemon status broadcasts')
assert.match(traySource, /approval-required/, 'tray must refresh approval state from approval-required events')
assert.match(traySource, /worker-exited/, 'tray must react to worker exit events')
assert.match(traySource, /worker-disconnected/, 'tray must react to worker disconnect events')
assert.match(traySource, /enabled:\s*!isBossRunning/, 'tray start action must reflect running state')
assert.match(traySource, /enabled:\s*isBossRunning\s*&&\s*!isBossStopping/, 'tray stop action must reflect running state')
assert.match(traySource, /process\.env\.GGR_HEADLESS/, 'tray must control headless mode through GGR_HEADLESS')
assert.match(traySource, /label:\s*['"]开始自动开聊['"]/, 'tray must show start auto chat action')
assert.match(traySource, /停止自动开聊/, 'tray must show stop auto chat action')
assert.match(traySource, /查看运行状态/, 'tray must show status action')
assert.match(traySource, /label:\s*['"]Headless 模式['"]/, 'tray must show headless toggle')
assert.match(traySource, /syncBossWorkerStateFromDaemon\(\)/, 'tray must load initial worker state from daemon')

const openSettingWindowSource = await read('packages/ui/src/main/flow/OPEN_SETTING_WINDOW/index.ts')
assert.match(openSettingWindowSource, /initTray\(/, 'setting window flow must initialize the tray')

const settingIpcSource = await read('packages/ui/src/main/flow/OPEN_SETTING_WINDOW/ipc/index.ts')
assert.match(settingIpcSource, /workerExitHandlerByMode/, 'worker exit forwarding must keep only one listener per worker')
assert.match(settingIpcSource, /WORKER_STOP_TIMEOUT_MS/, 'stopping a worker must have a bounded wait')

const daemonSource = await read('packages/pm/daemon.js')
assert.match(
  daemonSource,
  /if \(!workerInfo\)[\s\S]{0,500}type:\s*'worker-exited'/,
  'stopping an already-exited worker must emit the terminal event awaited by the UI'
)
assert.match(
  daemonSource,
  /case 'start-worker':[\s\S]{0,500}stoppedWorkers\.delete\(workerId\)[\s\S]{0,500}startWorker\(/,
  'an explicit worker start must clear any stale stop marker'
)
assert.match(
  daemonSource,
  /if \(!workerInfo\)[\s\S]{0,500}stoppedWorkers\.delete\(workerId\)/,
  'stopping an absent worker must not leave a stale stop marker'
)

const autoChatSource = await read('packages/geek-auto-start-chat-with-boss/index.mjs')
assert.doesNotMatch(
  autoChatSource,
  /const allowedAreas\s*=\s*\[['"]南山['"]/,
  'auto chat must not apply a hard-coded district allowlist'
)
assert.doesNotMatch(
  autoChatSource,
  /const CUSTOM_OPENING\s*=\s*customOpeningMessage\s*\|\|/,
  'auto chat must not invent an opening message when the user configured none'
)
assert.doesNotMatch(
  autoChatSource,
  /SOC monitoring experience and built AI agent tools/,
  'auto chat must not send a developer-specific fallback opening message'
)

const mainWindowSource = await read('packages/ui/src/main/window/mainWindow.ts')
assert.match(mainWindowSource, /function\s+showMainWindow\(/, 'main window module must expose showMainWindow for tray actions')
assert.match(mainWindowSource, /function\s+hideMainWindow\(/, 'main window module must expose hideMainWindow for tray actions')

const readNoReplyUiSource = await read('packages/ui/src/main/flow/READ_NO_REPLY_AUTO_REMINDER_MAIN/index.ts')
assert.match(readNoReplyUiSource, /ggr-backend\/lib\/workers\/read-no-reply/, 'Electron entry must delegate to backend worker')
assert.doesNotMatch(readNoReplyUiSource, /electron|connectToDaemon|process\.exit/, 'Electron entry must remain a thin compatibility wrapper')
const readNoReplySource = [
  await read('packages/ggr-backend/lib/workers/read-no-reply/flow.mjs'),
  await read('packages/ggr-backend/lib/workers/read-no-reply/reply-policy.mjs'),
  await read('packages/ggr-backend/lib/workers/read-no-reply/runtime.mjs')
].join('\n')
assert.match(readNoReplySource, /classifyHrMessage/, 'read-no-reply flow must classify latest HR messages')
assert.match(readNoReplySource, /buildAutoReply/, 'read-no-reply flow must build safe auto replies')
assert.match(readNoReplySource, /buildReviewDraft/, 'read-no-reply flow must build review-only AI drafts')
assert.match(readNoReplySource, /validateAutoReply/, 'read-no-reply flow must validate auto replies before sending')
assert.match(readNoReplySource, /appendApprovalRequest/, 'read-no-reply flow must queue approval-required messages')
assert.match(readNoReplySource, /draftSource:\s*reviewDraft\s*\?\s*['"]model_review_draft['"]/, 'review drafts must be marked as model review drafts')
assert.match(readNoReplySource, /draftSafety:\s*['"]needs_human_review['"]/, 'review drafts must be marked for human review')
assert.match(readNoReplySource, /listApprovals/, 'read-no-reply flow must read approved reply queue')
assert.match(readNoReplySource, /auto_reply_sent/, 'read-no-reply flow must mark approved AI auto replies as sent')
assert.match(readNoReplySource, /auto_reply_failed/, 'read-no-reply flow must mark approved AI auto replies as failed')
assert.match(readNoReplySource, /auto_reply_expired/, 'read-no-reply flow must mark stale approved AI auto replies as expired')
assert.match(readNoReplySource, /consumeApprovedAutoReply/, 'read-no-reply flow must consume approved AI auto replies in worker context')
assert.match(readNoReplySource, /approved draft is empty before send/, 'approved AI drafts should only require a non-empty draft before sending')
assert.match(readNoReplySource, /HR_REPLY_DECISION\.AUTO_REPLY/, 'read-no-reply flow must only auto-send AUTO_REPLY decisions')
assert.doesNotMatch(readNoReplySource, /approval-required[\s\S]{0,500}\)\.catch/, 'approval queue notification must not chain catch on fire-and-forget sendToDaemon')

const headlessLoggerSource = await read('packages/ui/src/main/features/headless-terminal-logger.ts')
assert.match(headlessLoggerSource, /function\s+redactTerminalText/, 'headless terminal logger must redact sensitive text')
assert.match(headlessLoggerSource, /\[手机号\]/, 'headless terminal logger must redact phone numbers')
assert.match(headlessLoggerSource, /\[邮箱\]/, 'headless terminal logger must redact emails')
assert.match(headlessLoggerSource, /redactTerminalText\(JSON\.stringify\(msgData\)\)/, 'fallback terminal logs must be redacted')
assert.match(headlessLoggerSource, /message\.code/, 'headless terminal logger must print daemon worker exit code')
assert.doesNotMatch(headlessLoggerSource, /message\.exitCode/, 'daemon worker exit payload uses code, not exitCode')
assert.doesNotMatch(headlessLoggerSource, /\$\{imgUrl\}/, 'headless terminal logger must not print raw image URLs')

console.log('ui static check passed')
