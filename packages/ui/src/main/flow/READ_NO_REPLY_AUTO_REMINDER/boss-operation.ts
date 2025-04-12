import { Page } from 'puppeteer'
import { sleepWithRandomDelay, sleep } from '@geekgeekrun/utils/sleep.mjs';
import { completes } from '@geekgeekrun/utils/gpt-request.mjs'

export const sendLookForwardReplyEmotion = async (page: Page) => {
  const emotionEntryButtonProxy = await page.$('.chat-conversation .message-controls .btn-emotion')
  await emotionEntryButtonProxy!.click()
  await sleepWithRandomDelay(1000)
  const duckEmotionTabEntryProxy = await page.$(
    '.chat-conversation .message-controls .emotion .emotion-tab .emotion-sort:nth-child(3)'
  )
  await duckEmotionTabEntryProxy!.click()
  await sleepWithRandomDelay(1500)
  const lookForwardReplyEmojiProxy = await page.$(
    `.chat-conversation .message-controls .emotion .emotion-box img[title=盼回复]`
  )
  await lookForwardReplyEmojiProxy!.click()
}

export const sendGptContent = async (page: Page, chatRecords) => {
  const chatList = [
    {
      role: 'system',
      content:
        '你是一个求职消息发送机器人，正在帮助一位求职者在Boss直聘上寻找一份工作。求职者需要向招聘者聊天，得到招聘者的回复后，方能获得一次投递简历的机会。你需要“从求职者简历中提取到的信息，来生成一个要发送给招聘者的消息”。同时你需要注意，每次发送的内容一定要接续之前发送的内容，最好不要和已发过的内容重复。求职者简历信息如下：' +
        ``
    }
  ]
  chatList.push({
    role: 'user',
    content:
      '请帮我写一句开场白。请确保仅响应一句话，以JSON响应；数据结构参考：`{"response": "这里是将会发送给招聘者的内容"}`'
  })
  for (const record of chatRecords) {
    const assistantJsonContent = JSON.stringify({
      response: record.text
    })
    chatList.push({
      role: 'assistant',
      content: `\`\`\`json\n${assistantJsonContent}\n\`\`\``
    })
    chatList.push({
      role: 'user',
      content:
        '请根据接续之前你所回复的内容，根据我的简历，写一句自我介绍，注意尽量不要和之前的聊天内容重复。请确保仅响应一句话，以JSON响应；数据结构参考：`{"response": "这里是将会发送给招聘者的内容"}`'
    })
  }

  console.log(chatList)
  debugger
  const res = await completes(chatList)
  console.log(res)
  let textToSend
  try {
    const rawMarkdownText = res?.message?.content
    textToSend = JSON.parse(
      rawMarkdownText.replace(/^```json/m, '').replace(/```$/m, '')
    )?.response
    if (!textToSend) {
      throw new Error(`empty content. ${err?.message} ${res?.message?.content}`)
    }
  } catch (err) {
    throw new Error(`fail to parse response. ${err?.message} ${res?.message?.content}`)
  }
  const chatInputSelector = `.chat-conversation .message-controls .chat-input`
  const chatInputHandle = await page.$(chatInputSelector)
  await chatInputHandle.click()
  await sleep(500)
  await chatInputHandle.click()
  await chatInputHandle.type(
    textToSend,
    {
      delay: 50
    }
  )
  await sleep(1000)
  const sendButtonSelector = `.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)`
  await page.click(sendButtonSelector)
}
