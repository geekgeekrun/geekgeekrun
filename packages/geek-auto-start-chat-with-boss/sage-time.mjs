import { sleep } from "@geekgeekrun/utils/sleep.mjs"

let totalEnabledTimes = 0

let recordedOpCount = 0
export const waitForSageTimeOrJustContinue = async ({
  tag
} = {}) => {
  const tagText = tag ? ` ${tag}` : ''
  if (recordedOpCount > 50) {
    totalEnabledTimes++
    console.log(`[SageTime${tagText}] 请求已达限制，开启；当前记录次数 ${recordedOpCount}；第 ${totalEnabledTimes} 次开启`)
    await sleep(5 * 60 * 1000)
    console.log(`[SageTime${tagText}] 请求限制已解除，关闭；当前记录次数 ${recordedOpCount}；第 ${totalEnabledTimes} 次关闭`)
    recordedOpCount = 0
  }
  else {
    console.log(`[SageTime${tagText}] 请求未达限制；当前记录次数 ${recordedOpCount}；已开启过 ${totalEnabledTimes} 次`)
    recordedOpCount++
  }
}