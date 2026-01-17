import { app } from 'electron'
import { main, loginEventBus } from '@geekgeekrun/launch-bosszhipin-login-page-with-preload-extension'
import { pipeWriteRegardlessError } from './utils/pipe'
import fs from "node:fs";

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
  } catch (err) {
    console.error(err)
    app.exit(1)
    return
  }

  loginEventBus.once('cookie-collected', (cookies) => {
    pipeWriteRegardlessError(
      pipe,
      JSON.stringify({
        type: 'BOSS_ZHIPIN_COOKIE_COLLECTED',
        cookies
      }) + '\r\n'
    )
  })
  main()
}
