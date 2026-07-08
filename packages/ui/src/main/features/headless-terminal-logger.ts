import { daemonEE } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'

function getTimestamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function getFullTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

/** Format HR name+company for display */
function formatSender(info?: { bossName?: string; brandName?: string; companyName?: string }): string {
  const name = info?.bossName || ''
  const company = info?.brandName || info?.companyName || ''
  if (name && company) return `${name} @ ${company}`
  if (name) return name
  if (company) return company
  return 'HR'
}

function formatJob(positionInfo: Record<string, unknown>): string {
  try {
    const jobInfo = (positionInfo?.jobInfo || positionInfo) as Record<string, unknown> | undefined
    const bossInfo = positionInfo?.bossInfo as Record<string, unknown> | undefined
    if (!jobInfo) return ''
    const parts: string[] = []
    if (jobInfo.jobName) parts.push(String(jobInfo.jobName))
    if (jobInfo.positionName) parts.push(`(${jobInfo.positionName})`)
    if (jobInfo.salaryDesc) parts.push(String(jobInfo.salaryDesc))
    if (bossInfo?.brandName) parts.push(`@ ${bossInfo.brandName}`)
    if (bossInfo?.name) parts.push(`- ${bossInfo.name}`)
    return parts.join(' ') || JSON.stringify(jobInfo)
  } catch {
    return ''
  }
}

type DaemonMessage = Record<string, unknown> & { type?: string; data?: Record<string, unknown> }

function printDaemonMessage(message: DaemonMessage) {
  if (!message || !message.type) return
  const ts = getTimestamp()
  const type = String(message.type)

  switch (type) {
    // ── Status updates ──
    case 'status': {
      const count = Array.isArray(message.workers) ? message.workers.length : 0
      console.log(`[${ts}] [status] workers: ${count}`)
      for (const w of (message.workers as Array<{ workerId?: string; pid?: number }>) || []) {
        console.log(`  ├─ ${w.workerId} (pid: ${w.pid})`)
      }
      break
    }

    // ── Worker messages (the main event stream) ──
    case 'worker-to-gui-message': {
      const msgData = message.data as Record<string, unknown> | undefined
      if (!msgData) break
      const msgType = String(msgData.type ?? '')

      switch (msgType) {
        // ✅ 找到新岗位，开始聊天
        case 'chat-started': {
          const position = msgData.position as Record<string, unknown> | undefined
          if (position) {
            const jobInfo = position.jobInfo as Record<string, unknown> | undefined
            const bossInfo = position.bossInfo as Record<string, unknown> | undefined
            const company = bossInfo?.brandName ?? ''
            const hr = bossInfo?.name ?? ''
            const job = jobInfo?.jobName ?? ''
            const salary = jobInfo?.salaryDesc ?? ''
            console.log('')
            console.log(`💼 ${getFullTimestamp()}`)
            console.log(`   企业: ${company}`)
            console.log(`   岗位: ${job} ${salary}`)
            if (hr) console.log(`   HR:   ${hr}`)
            console.log('')
          }
          break
        }

        // ✅ AI 发送的消息
        case 'llm-reply':
        case 'ai-reply': {
          const text = (msgData.text ?? msgData.message ?? '') as string
          if (!text) break
          const target = msgData.hrName
            ? `${msgData.hrName}${msgData.company ? ` @ ${msgData.company}` : ''}`
            : 'HR'
          console.log(`  🤖 → ${target}: ${text}`)
          break
        }

        // ✅ HR 回复的消息
        case 'hr-reply': {
          const hrText = (msgData.text ?? msgData.message ?? '') as string
          const sender = msgData.hrName
            ? `${msgData.hrName}${msgData.company ? ` @ ${msgData.company}` : ''}`
            : 'HR'
          if (hrText) console.log(`  👤 ${sender}: ${hrText}`)
          // 文件附件
          if (msgData.files) {
            const files = msgData.files as Array<{ name?: string; url?: string }> | string
            const filesArr = Array.isArray(files) ? files : []
            for (const f of filesArr) {
              console.log(`  📎  文件: ${f.name || f.url || '(未知文件)'}`)
            }
          }
          break
        }

        // ✅ 聊天消息（AI ↔ HR 双方）
        case 'chat-message': {
          const direction = String(msgData.direction ?? '')
          const text = (msgData.text ?? '') as string
          const msgType = String(msgData.msgType ?? 'text')
          const sender = msgData.hrName
            ? `${msgData.hrName}${msgData.company ? ` @ ${msgData.company}` : ''}`
            : ''
          const prefix = direction === 'sent' ? '🤖' : '👤'
          const label = direction === 'sent'
            ? `AI → ${sender || 'HR'}`
            : `${sender || 'HR'} → AI`
          // 文字消息
          if (msgType === 'text' && text) {
            console.log(`  ${prefix} ${label}: ${text}`)
          }
          // 文件附件（图片、简历等）
          else if (msgType === 'image') {
            const imgUrl = (msgData.imageUrl ?? '') as string
            console.log(`  ${prefix} ${label}: 📷 [图片]${imgUrl ? ` ${imgUrl}` : ''}`)
          } else if (msgType === 'resume') {
            console.log(`  ${prefix} ${label}: 📄 [简历文件]${text ? ` ${text}` : ''}`)
          } else {
            console.log(`  ${prefix} ${label}: [${msgType}]${text ? ` ${text}` : ''}`)
          }
          break
        }

        // ✅ 岗位筛选/匹配
        case 'job-found':
        case 'job-matched': {
          const jobName = (msgData.jobName ?? msgData.positionName ?? '') as string
          const _company = (msgData.brandName ?? msgData.company ?? '') as string
          const salary = (msgData.salaryDesc ?? '') as string
          if (jobName) {
            console.log(`  🔍 发现岗位: ${jobName} ${salary}${_company ? ` @ ${_company}` : ''}`)
          }
          break
        }

        // ✅ 进度检查点
        case 'prerequisite-step-by-step-check': {
          const step = msgData.step as Record<string, unknown> | undefined
          if (!step) break
          const status = String(step.status ?? '')
          const icon = status === 'fulfilled' ? '✅' : status === 'rejected' ? '⛔' : '🔄'
          console.log(`  ${icon} ${String(step.id ?? '?')}`)
          break
        }

        // 其他消息类型
        default:
          if (msgType && !['pong', 'user-process-register'].includes(msgType)) {
            // 尝试提取有用文本
            const text =
              (msgData.text as string) ||
              (msgData.message as string) ||
              (msgData.content as string) ||
              ''
            if (text) {
              console.log(`  [${msgType}] ${text}`)
            } else {
              console.log(`  [${msgType}]`, JSON.stringify(msgData).slice(0, 200))
            }
          }
      }
      break
    }

    case 'worker-started':
      console.log(`[${ts}] 🚀 worker ${message.workerId} (pid: ${message.pid})`)
      break

    case 'worker-exited':
      console.log(`[${ts}] 🛑 worker ${message.workerId} (code: ${message.exitCode})`)
      break

    case 'worker-error':
      console.error(`[${ts}] 🔴 worker ${message.workerId}: ${message.error}`)
      break

    default:
      if (type !== 'pong' && type !== 'user-process-register') {
        console.log(`[${ts}] [${type}]`, message)
      }
  }
}

export function startHeadlessTerminalLogger() {
  console.log('')
  console.log('══════════════════════════════════════════')
  console.log('  GeekGeekRun — Headless 模式')
  console.log(`  启动: ${new Date().toISOString()}`)
  console.log('  ✅ 实时日志已开启')
  console.log('══════════════════════════════════════════')
  console.log('')

  daemonEE.on('message', printDaemonMessage)
  daemonEE.on('connect', () => console.log(`[${getTimestamp()}] 🔗 daemon 已连接`))
  daemonEE.on('close', () => console.log(`[${getTimestamp()}] 🔌 daemon 已断开`))
  daemonEE.on('error', (err: Error) => console.error(`[${getTimestamp()}] 🔴 daemon 错误:`, err.message))
}
