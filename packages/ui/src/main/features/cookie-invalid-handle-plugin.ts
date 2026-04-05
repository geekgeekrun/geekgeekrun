import { sendToDaemon } from '../flow/OPEN_SETTING_WINDOW/connect-to-daemon'
import minimist from 'minimist'
import { loginWithCookieAssistant } from './login-with-cookie-assistant'
import { checkCookieListFormat } from '../../common/utils/cookie'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
import { readStorageFile } from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

const runRecordId = minimist(process.argv.slice(2))['run-record-id'] ?? null
export class CookieInvalidHandlePlugin {
  apply(hooks) {
    hooks.cookieWillSet.tapPromise('CookieInvalidHandlePlugin', async ({ cookies, browser } = {}) => {
      let isValid = checkCookieListFormat(cookies)
      while (!isValid) {
        try {
          browser && (await browser.close())
        } catch (err) {
          console.log(`close browser failed`, err)
        }
        try {
          // popup login dialog, then update login status
          let app
          try {
            app = (await import('electron')).app
          } catch {
            //
          }
          // popup login dialog, then update login status
          try {
            await app?.dock?.show()
            await loginWithCookieAssistant()
          } finally {
            await app?.dock?.hide()
          }
          await sleep(2000)
          const newCookies = readStorageFile('boss-cookies.json')
          isValid = checkCookieListFormat(newCookies)
          if (isValid) {
            cookies.length = 0
            for (const cookie of newCookies) {
              cookies.push(cookie)
            }
          }
        } catch (e) {
          if (e?.message === 'USER_CANCELLED_LOGIN') {
            sendToDaemon({
              type: 'worker-to-gui-message',
              workerId: process.env.GEEKGEEKRUND_WORKER_ID,
              data: {
                type: 'prerequisite-step-by-step-check',
                step: {
                  id: 'basic-cookie-check',
                  status: 'rejected'
                },
                runRecordId
              }
            })
            throw new Error('LOGIN_STATUS_INVALID')
          }
        }
      }
      sendToDaemon({
        type: 'worker-to-gui-message',
        workerId: process.env.GEEKGEEKRUND_WORKER_ID,
        data: {
          type: 'prerequisite-step-by-step-check',
          step: {
            id: 'basic-cookie-check',
            status: 'fulfilled'
          },
          runRecordId
        }
      })
    })
    hooks.userInfoResponse.tapPromise('CookieInvalidHandlePlugin', async ({ userInfoResponse, browser } = {}) => {
      if (userInfoResponse.code === 0) {
        sendToDaemon({
          type: 'worker-to-gui-message',
          workerId: process.env.GEEKGEEKRUND_WORKER_ID,
          data: {
            type: 'prerequisite-step-by-step-check',
            step: {
              id: 'login-status-check',
              status: 'fulfilled'
            },
            runRecordId
          }
        })
        return
      }
      try {
        browser && (await browser.close())
      } catch (err) {
        console.log(`close browser failed`, err)
      }
      try {
        // popup login dialog, then update login status
        let app
        try {
          app = (await import('electron')).app
        } catch {
          //
        }
        // popup login dialog, then update login status
        try {
          await app?.dock?.show()
          await loginWithCookieAssistant()
        } finally {
          await app?.dock?.hide()
        }
      } catch (e) {
        if (e?.message === 'USER_CANCELLED_LOGIN') {
          sendToDaemon({
            type: 'worker-to-gui-message',
            workerId: process.env.GEEKGEEKRUND_WORKER_ID,
            data: {
              type: 'prerequisite-step-by-step-check',
              step: {
                id: 'login-status-check',
                status: 'rejected'
              },
              runRecordId
            }
          })
          throw new Error('LOGIN_STATUS_INVALID')
        }
      }
      // throw new Error('THROW_FOR_RETRY')
      return Promise.reject(new Error('THROW_FOR_RETRY'))
    })
  }
}
