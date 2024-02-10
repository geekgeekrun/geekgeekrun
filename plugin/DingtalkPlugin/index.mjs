import { requestDingTalkNotify, createTextMessage } from './dingtalk.mjs'
export default class DingtalkPlugin {
  constructor (dingtalkAccessToken) {
    this.dingtalkAccessToken = dingtalkAccessToken
  }
  apply (hooks) {
    if (!this.dingtalkAccessToken) {
      console.log(`[DingtalkPlugin] AccessToken is empty, which makes the plugin won't do anything.`)
      return
    }
    hooks.errorEncounter.tap(
      'DingtalkPlugin',
      (errorInfo) => {
        requestDingTalkNotify(
          this.dingtalkAccessToken, createTextMessage(errorInfo)
        )
      }
    )
  }
}