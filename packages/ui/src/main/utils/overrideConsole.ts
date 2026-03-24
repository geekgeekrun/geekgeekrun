import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import dayjs from 'dayjs'

export default function overrideConsole() {
  const originConsoleLog = console.log.bind(console)
  const originConsoleWarn = console.warn.bind(console)
  const originConsoleError = console.error.bind(console)

  const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
  const logDirPath = path.join(runtimeFolderPath, 'log')

  let logFileStream: fs.WriteStream | null = null
  let warnFileStream: fs.WriteStream | null = null
  let errorFileStream: fs.WriteStream | null = null

  try {
    if (!fs.existsSync(logDirPath)) {
      fs.mkdirSync(logDirPath, { recursive: true })
    }

    logFileStream = fs.createWriteStream(path.join(logDirPath, `log.log`), {
      flags: 'a'
    })
    warnFileStream = fs.createWriteStream(path.join(logDirPath, `warn.log`), {
      flags: 'a'
    })
    errorFileStream = fs.createWriteStream(path.join(logDirPath, `error.log`), {
      flags: 'a'
    })

    // 监听错误事件，防止未捕获的错误导致应用崩溃
    logFileStream.on('error', () => {})
    warnFileStream.on('error', () => {})
    errorFileStream.on('error', () => {})
  } catch (err) {
    originConsoleError(
      `[Override console] Failed to initialize log files, logging to console only: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  console.log = (...args: any[]) => {
    const lineHead = `${dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')} [log][PID=${process.pid}]`
    originConsoleLog(lineHead, ...args)
    try {
      logFileStream?.write(
        [
          lineHead,
          args.map((arg) => {
            try {
              return JSON.stringify(arg)
            } catch (err) {
              return `[[${JSON.stringify(err instanceof Error ? err.message : String(err))}]]`
            }
          })
        ].join(' ') + '\n'
      )
    } catch (err) {
      // Silently fail - already logged to console
    }
  }

  console.warn = (...args: any[]) => {
    const lineHead = `${dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')} [warn][PID=${process.pid}]`
    originConsoleWarn(lineHead, ...args)
    try {
      warnFileStream?.write(
        [
          lineHead,
          args.map((arg) => {
            try {
              return JSON.stringify(arg)
            } catch (err) {
              return `[[${JSON.stringify(err instanceof Error ? err.message : String(err))}]]`
            }
          })
        ].join(' ') + '\n'
      )
    } catch (err) {
      // Silently fail - already logged to console
    }
  }

  console.error = (...args: any[]) => {
    const lineHead = `${dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')} [error][PID=${process.pid}]`
    originConsoleError(lineHead, ...args)
    try {
      errorFileStream?.write(
        [
          lineHead,
          args.map((arg) => {
            try {
              return JSON.stringify(arg)
            } catch (err) {
              return `[[${JSON.stringify(err instanceof Error ? err.message : String(err))}]]`
            }
          })
        ].join(' ') + '\n'
      )
    } catch (err) {
      // Silently fail - already logged to console
    }
  }
}
