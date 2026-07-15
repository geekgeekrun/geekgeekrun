/**
 * Text-based DOM query helpers — resilient to BOSS frontend class name changes.
 *
 * Strategy:
 *   1. Try XPath by visible text (buttons, dialogs)
 *   2. Fall back to contenteditable / semantic attributes
 *   3. Last resort: original brittle selector
 */

/**
 * Find an element by its visible text content within a container.
 * Uses XPath `contains(text(), ...)` which is immune to class changes.
 */
function buttonXPath(texts) {
  return `xpath/.//button[not(@disabled) and (${texts.map((text) => `contains(normalize-space(.), ${JSON.stringify(text)})`).join(' or ')})]`
}

function textXPath(text, tag) {
  return `xpath///${tag}[contains(normalize-space(.), ${JSON.stringify(text)})]`
}

async function findVisibleButtonByText(scope, texts) {
  const buttons = await scope.$$(buttonXPath(texts))
  for (const button of buttons) {
    if (await button.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
    })) return button
  }
  return null
}

export async function findStartChatButton(page, { detailSelector = '.job-detail-box' } = {}) {
  const detail = await page.$(detailSelector)
  if (!detail) return null
  return findVisibleButtonByText(detail, ['聊一聊', '立即沟通'])
}

export async function findByText(page, text, { tag = '*', timeout = 5000 } = {}) {
  try {
    return await page.waitForSelector(textXPath(text, tag), { timeout })
  } catch {
    return null
  }
}

/**
 * Find ALL elements matching text content (for disambiguation).
 */
export async function findAllByText(page, text, { tag = '*' } = {}) {
  return page.$$(textXPath(text, tag))
}

/**
 * Wait for and return an element by text content.
 * Throws if not found within timeout (like waitForSelector).
 */
export async function waitForText(page, text, { tag = '*', timeout = 10000 } = {}) {
  return page.waitForSelector(textXPath(text, tag), { timeout })
}

/**
 * Click an element by text content. Returns true if clicked, false otherwise.
 */
export async function clickByText(page, text, { tag = '*', timeout = 5000 } = {}) {
  const el = await findByText(page, text, { tag, timeout })
  if (!el) return false
  await el.click()
  return true
}

/**
 * Find the chat input element — uses contenteditable attribute which is
 * semantically stable, with CSS class fallback.
 */
export async function findChatInput(page, { timeout = 10000 } = {}) {
  try {
    // First try: contenteditable (semantic, rarely changes)
    return await page.waitForSelector('[contenteditable="true"]', { timeout })
  } catch {
    try {
      // Second try: textarea
      return await page.waitForSelector('textarea', { timeout: 3000 })
    } catch {
      return null // caller handles
    }
  }
}

/**
 * Find the send button in a chat area — uses multiple strategies.
 * BOSS typically uses an icon button with class containing "send" or "btn-send".
 */
export async function findSendButton(page, { timeout = 5000 } = {}) {
  try {
    const input = await findChatInput(page, { timeout })
    if (!input) return null
    const containerHandle = await input.evaluateHandle((element) =>
      element.closest('form, .chat-input-box, .chat-conversation, [class*="chat-input"], [class*="chat"]') ?? element.parentElement
    )
    const container = containerHandle.asElement()
    if (!container) return null
    const selectors = [
      '[class*="btn-send"]',
      '[class*="send"]',
      '[data-testid="send-button"]',
      'button[class*="chat"]',
      '[class*="icon-message-send"]',
    ]
    for (const sel of selectors) {
      const el = await container.$(sel)
      if (el) return el
    }
    return findVisibleButtonByText(container, ['发送'])
  } catch {
    return null
  }
}

/**
 * Type text into the chat input field.
 */
export async function typeInChat(page, text, { delay = 30 } = {}) {
  const input = await findChatInput(page)
  if (!input) return false
  await input.click()
  await input.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) element.value = ''
    else element.textContent = ''
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }))
  })
  await input.type(text, { delay })
  return true
}

/**
 * Wait for and find the greet dialog button (send or primary action).
 */
export async function findGreetSendButton(page, { timeout = 5000 } = {}) {
  const deadline = Date.now() + timeout
  while (true) {
    const dialogs = await page.$$('[role="dialog"], .greet-boss-dialog')
    for (const dialog of dialogs) {
      const button = await findVisibleButtonByText(dialog, ['发送'])
      if (button) return button
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) return null
    await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining)))
  }
}

export async function findGreetCancelButton(page) {
  const dialogs = await page.$$('[role="dialog"], .greet-boss-dialog')
  for (const dialog of dialogs) {
    const button = await findVisibleButtonByText(dialog, ['取消'])
    if (button) return button
  }
  return null
}
