import { requestDingtalkNotify, createTextMessage } from './service.mjs'
import dayjs from 'dayjs'

let sendQueueTimer = 0
let collectedMessageList = []

export default class DingtalkPlugin {
  constructor (dingtalkAccessToken) {
    this.dingtalkAccessToken = dingtalkAccessToken
  }
  setSendQueueTimer () {
    const _this = this
    const interval = 2 * 60 * 1000
    function sendMergedMessage () {
      if (collectedMessageList.length === 0) {
      } else if (collectedMessageList.length === 1) {
        collectedMessageList[0].dingtalkRequestBody.text.content += `\n${dayjs(collectedMessageList[0].insertedTime).format('MM-DD HH:mm:ss')}\n\n【geekgeekrun】`
        requestDingtalkNotify(
          _this.dingtalkAccessToken, JSON.stringify(collectedMessageList[0].dingtalkRequestBody)
        ).then(res => res.json()).then((res) => {
          console.log('[DingtalkPlugin] Response: ', res)
        }, () => void 0)
      } else {
        requestDingtalkNotify(
          _this.dingtalkAccessToken, JSON.stringify((createTextMessage(
            collectedMessageList.map(it => {
              return `${it.dingtalkRequestBody.text.content}\n${dayjs(it.insertedTime).format('MM-DD HH:mm:ss')}\n`
            }).join('-----\n') + '\n【geekgeekrun】'
          )).dingtalkRequestBody)
        ).then(res => res.json()).then((res) => {
          console.log('[DingtalkPlugin] Response: ', res)
        }, () => void 0)
      }
      collectedMessageList.length = 0
      sendQueueTimer = setTimeout(sendMergedMessage, interval)
    }
    sendQueueTimer = setTimeout(sendMergedMessage, interval)
    // FIXME: exit immediate without wait
    process.on('SIGINT', () => {
      sendMergedMessage()
      setTimeout(() => {
        process.exit(0)
      }, 5000)
    })
  }
  destroySendQueueTimer () {
    clearTimeout(sendQueueTimer)
  }
  apply (hooks) {
    if (!this.dingtalkAccessToken) {
      console.log(`[DingtalkPlugin] AccessToken is empty, which makes the plugin won't do anything.`)
      return
    }
    this.destroySendQueueTimer()
    this.setSendQueueTimer()
    hooks.errorEncounter.tap(
      'DingtalkPlugin',
      (errorInfo) => {
        collectedMessageList.push(createTextMessage(errorInfo))
      }
    )
    hooks.newChatStartup.tap(
      'DingtalkPlugin',
      ({jobInfo, bossInfo}) => {
        collectedMessageList.push(createTextMessage(
          `${bossInfo.brandName} ${bossInfo.name}
${jobInfo.jobName} ${jobInfo.salaryDesc}
Chat has startup!`
        ))
      }
    )
  }
}