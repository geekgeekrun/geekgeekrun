import { app } from 'electron'
import { main } from '@geekgeekrun/launch-bosszhipin-login-page-with-preload-extension'
import { pipeWriteRegardlessError } from './utils/pipe'

export enum DOWNLOAD_ERROR_EXIT_CODE {
  NO_ERROR = 0,
  DOWNLOAD_ERROR = 1
}

export const launchBossZhipinLoginPageWithPreloadExtension = async () => {
  process.on('disconnect', () => app.exit())
  app.dock?.hide()
  let pipe: null | fs.WriteStream = null
  try {
    pipe = fs.createWriteStream(null, { fd: 3 })
  } catch {
    console.warn('pipe is not available')
  }
  pipeWriteRegardlessError(
    pipe,
    JSON.stringify({
      type: 'INITIALIZE_PUPPETEER'
    }) + '\r\n'
  )
  const { initPuppeteer } = await import('@geekgeekrun/geek-auto-start-chat-with-boss/index.mjs')
  try {
    await initPuppeteer()
    pipeWriteRegardlessError(
      pipe,
      JSON.stringify({
        type: 'PUPPETEER_INITIALIZE_SUCCESSFULLY'
      }) + '\r\n'
    )
  } catch (err) {
    console.error(err)
    app.exit(1)
    return
  }

  main()
}
