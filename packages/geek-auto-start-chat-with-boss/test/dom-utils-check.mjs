import assert from 'node:assert/strict'
import puppeteer from 'puppeteer'

import { findGreetCancelButton, findGreetSendButton, findSendButton, findStartChatButton, typeInChat, waitForText } from '../dom-utils.mjs'

const browser = await puppeteer.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.setContent(`
    <button id="outside"><span>聊一聊</span></button>
    <section class="job-detail-box">
      <button id="disabled" disabled><span>聊一聊</span></button>
      <button id="detail"><span>立即沟通</span></button>
    </section>
  `)

  const button = await findStartChatButton(page)
  assert.equal(await button.evaluate((element) => element.id), 'detail')

  await page.setContent(`
    <button id="outside-send">发送</button>
    <div role="dialog" aria-label="打招呼">
      <button id="greet-send"><span>发送</span></button>
    </div>
  `)
  const greetSendButton = await findGreetSendButton(page)
  assert.equal(await greetSendButton.evaluate((element) => element.id), 'greet-send')
  await page.setContent('')
  await page.evaluate(() => setTimeout(() => {
    document.body.innerHTML = '<div role="dialog"><button id="delayed-greet-send">发送</button></div>'
  }, 50))
  const delayedGreetSendButton = await findGreetSendButton(page, { timeout: 500 })
  assert.equal(await delayedGreetSendButton.evaluate((element) => element.id), 'delayed-greet-send')
  await page.setContent(`
    <button id="outside-cancel">取消</button>
    <div role="dialog" aria-label="打招呼"><button id="greet-cancel">取消</button></div>
  `)
  const greetCancelButton = await findGreetCancelButton(page)
  assert.equal(await greetCancelButton.evaluate((element) => element.id), 'greet-cancel')

  await page.setContent('<textarea id="chat-input"></textarea>')
  await page.$eval('#chat-input', (element) => { element.value = 'existing greeting' })
  assert.equal(await typeInChat(page, 'new greeting', { delay: 0 }), true)
  assert.equal(await page.$eval('#chat-input', (element) => element.value), 'new greeting')

  await page.setContent('<button id="confirm"><span>确定</span></button>')
  const confirmButton = await waitForText(page, '确定', { tag: 'button' })
  assert.equal(await confirmButton.evaluate((element) => element.id), 'confirm')

  await page.setContent(`
    <button id="outside-send" class="btn-send">发送</button>
    <form class="chat-input-box">
      <textarea></textarea>
      <button id="chat-send" class="btn-send">发送</button>
    </form>
  `)
  const sendButton = await findSendButton(page)
  assert.equal(await sendButton.evaluate((element) => element.id), 'chat-send')
} finally {
  await browser.close()
}

console.log('dom utils check passed')
