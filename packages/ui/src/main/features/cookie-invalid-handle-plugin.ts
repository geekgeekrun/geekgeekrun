import { requestBackend } from '../backend/client'
import { loginWithCookieAssistant } from './login-with-cookie-assistant'
import { checkCookieListFormat } from '../../common/utils/cookie'

async function promptForLogin() {
  let app: Electron.App | undefined
  try {
    app = (await import('electron')).app
  } catch {
    // The backend worker can run without an Electron presentation process.
  }
  try {
    await app?.dock?.show()
    await loginWithCookieAssistant()
  } finally {
    await app?.dock?.hide()
  }
}

/**
 * Legacy hook shape retained for integrations that still load this module.
 * Browser ownership stays with the backend; Electron only presents the login prompt.
 */
export class CookieInvalidHandlePlugin {
  apply(hooks: any) {
    hooks.cookieWillSet.tapPromise('CookieInvalidHandlePlugin', async ({ cookies, browser }: any = {}) => {
      if (checkCookieListFormat(cookies)) return
      await browser?.close().catch(() => {})
      await promptForLogin()
      throw new Error('THROW_FOR_RETRY')
    })
    hooks.userInfoResponse.tapPromise('CookieInvalidHandlePlugin', async ({ userInfoResponse, browser }: any = {}) => {
      if (userInfoResponse.code === 0) return
      await browser?.close().catch(() => {})
      await requestBackend('config.write', { resource: 'boss_cookies', patch: [] })
      await promptForLogin()
      throw new Error('THROW_FOR_RETRY')
    })
  }
}
