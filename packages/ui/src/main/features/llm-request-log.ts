import { saveGptCompletionRequestRecord } from '@geekgeekrun/sqlite-plugin/dist/handlers'

export const RequestSceneEnum = {
  testing: 1,
  readNoReplyAutoReminder: 2,
  geekAutoStartChatWithBoss: 3
}
export const providerApiSecretToMd5Map = {}

let dbInitPromise
export const recordGptCompletionRequest = async (payload) => {
  const { getPublicDbFilePath } = await import(
    '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
  )
  const { initDb } = await import('@geekgeekrun/sqlite-plugin')
  const SparkMD5 = await import('spark-md5')

  if (!dbInitPromise) {
    dbInitPromise = initDb(getPublicDbFilePath())
  }
  const ds = await dbInitPromise
  const o = { ...payload }
  if (!providerApiSecretToMd5Map[o.providerApiSecret]) {
    providerApiSecretToMd5Map[o.providerApiSecret] = SparkMD5.hash(o.providerApiSecret)
  }
  o.providerApiSecretMd5 = providerApiSecretToMd5Map[o.providerApiSecret]
  delete o.providerApiSecret
  await saveGptCompletionRequestRecord(ds, [o])
}
