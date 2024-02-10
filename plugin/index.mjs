import DingtalkPlugin from './DingtalkPlugin/index.mjs'
import { dingTalkAccessToken } from "../config/dingtalk.mjs"

export const initPlugins = (hooks) => {
  new DingtalkPlugin(dingTalkAccessToken).apply(hooks)
}