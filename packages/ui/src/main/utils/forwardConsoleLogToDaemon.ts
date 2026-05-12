import { sendToDaemon } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'

export function forwardConsoleLogToDaemon(workerId: string, runRecordId: string | null) {
  let isForwarding = false

  const forward = (prefix: string, originalFn: (...args: any[]) => void, args: any[]) => {
    originalFn(...args)
    if (isForwarding) return
    isForwarding = true
    try {
      const body = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
      const message = prefix ? `${prefix} ${body}` : body
      sendToDaemon({
        type: 'worker-to-gui-message',
        data: { type: 'worker-log', workerId, message, runRecordId }
      })
    } finally {
      isForwarding = false
    }
  }

  const originalLog = console.log.bind(console)
  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)

  console.log = (...args: any[]) => forward('', originalLog, args)
  console.warn = (...args: any[]) => forward('[WARN]', originalWarn, args)
  console.error = (...args: any[]) => forward('[ERROR]', originalError, args)
}
