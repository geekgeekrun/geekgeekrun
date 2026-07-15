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
export async function findByText(page, text, { tag = '*', timeout = 5000 } = {}) {
  const xpath = `//${tag}[contains(normalize-space(text()), ${JSON.stringify(text)})]`
  try {
    const [el] = await page.waitForXPath(xpath, { timeout })
    return el ?? null
  } catch {
    return null
  }
}

/**
 * Find ALL elements matching text content (for disambiguation).
 */
export async function findAllByText(page, text, { tag = '*' } = {}) {
  const xpath = `//${tag}[contains(normalize-space(text()), ${JSON.stringify(text)})]`
  return page.$x(xpath)
}

/**
 * Wait for and return an element by text content.
 * Throws if not found within timeout (like waitForSelector).
 */
export async function waitForText(page, text, { tag = '*', timeout = 10000 } = {}) {
  const xpath = `//${tag}[contains(normalize-space(text()), ${JSON.stringify(text)})]`
  const [el] = await page.waitForXPath(xpath, { timeout })
  return el
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
    // Try by attribute patterns that are more stable than class names
    const selectors = [
      '[class*="btn-send"]',
      '[class*="send"]',
      '[data-testid="send-button"]',
      'button[class*="chat"]',
      '[class*="icon-message-send"]',
    ]
    for (const sel of selectors) {
      const el = await page.$(sel)
      if (el) return el
    }
    // Last: any button near the chat input
    const input = await findChatInput(page, { timeout: 2000 }).catch(() => null)
    if (input) {
      const parent = await input.evaluateHandle(el => el.closest('.chat-input-box, .chat-conversation, [class*="chat"]'))
      if (parent) {
        const btn = await parent.asElement().$('button')
        if (btn) return btn
      }
    }
    return null
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
  await page.evaluate(el => el.textContent = '', input) // clear
  await new Promise(r => setTimeout(r, 300))
  await input.type(text, { delay })
  return true
}

/**
 * Wait for and find the greet dialog button (send or primary action).
 */
export async function findGreetSendButton(page, { timeout = 5000 } = {}) {
  // The greet dialog typically has a prominent primary/send button
  // Try text first, then fallback to CSS
  const button = await findByText(page, '发送', { tag: 'button', timeout })
  if (button) return button
  // Try generic primary button
  try {
    return await page.waitForSelector('[class*="btn-primary"], .greet-boss-footer button:not([class*="cancel"])', { timeout })
  } catch {
    return null
  }
}
