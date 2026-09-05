import { Page } from 'puppeteer'
import { sleepWithRandomDelay, sleep } from '@geekgeekrun/utils/sleep.mjs'
import { completes } from '@geekgeekrun/utils/gpt-request.mjs'
import { recordGptCompletionRequest, RequestSceneEnum } from '../../features/llm-request-log'
import {
  readConfigFile,
  readStorageFile,
  writeStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { formatResumeJsonToMarkdown } from '../../../common/utils/resume'
import { SINGLE_ITEM_DEFAULT_SERVE_WEIGHT } from '../../../common/constant'
import tls from 'node:tls'
import { LlmModelUsageRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/LlmModelUsageRecord'
import gtag from '../../utils/gtag'

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

const pickLlmConfigFromList = (llmConfigList, blockModelSet) => {
  if (llmConfigList.length === 1) {
    llmConfigList[0].enabled = true
    llmConfigList[0].serveWeight = SINGLE_ITEM_DEFAULT_SERVE_WEIGHT
  }
  llmConfigList = llmConfigList.filter((it) => it.enabled && !blockModelSet.has(it.id))
  if (!llmConfigList.length) {
    return null
  }
  llmConfigList.forEach((conf) => {
    if (!Number(conf.serveWeight) || conf.serveWeight < 1) {
      conf.serveWeight = 1
    }
    if (conf.serveWeight > 100) {
      conf.serveWeight = 100
    }
  })
  const pool: number[] = []
  for (let i = 0; i < llmConfigList.length; i++) {
    for (let j = 0; j < Math.floor(llmConfigList[i].serveWeight); j++) {
      pool.push(llmConfigList[i].id)
    }
  }
  if (!pool.length) {
    return null
  }
  const index = Math.floor(pool.length * Math.random())
  return llmConfigList.find((it) => it.id === pool[index]) ?? null
}

const RESUME_PLACEHOLDER = `__REPLACE_REAL_RESUME_HERE__`
export const defaultPromptMap = {
  rechat: {
    fileName: 'auto-reminder-resume-system-message-template.md',
    content: `**核心指令：**
你是一个智能求职助手，需要根据用户简历生成30字左右的提醒消息，满足以下要求：
1. 每次生成需满足：
   - √ 包含1个核心技能 + 1个成果量化
   - √ 使用不同句式模板（至少准备5种）
   - √ 谦虚一些，头衔、工作年限等在历史记录信息中出现一次就好
   - ✗ 严禁与最近发送的几条相似或雷同
   - ✗ 严禁出现简历之外的词语
   - ✗ 严禁包含最近8条已经发过的内容（包括但不限于职位名称）

**简历分析层：**
请从以下简历内容中提取关键要素：\n\`\`\`markdown\n${RESUME_PLACEHOLDER}\n\`\`\`\n

---
要求提取：
1. 硬技能：编程语言/技术栈/工具证书等（至少提取5项）
2. 项目经历与成果：业绩、带量化数据的结果（至少3条）
3. 软技能：沟通/管理等（至少2项）
4. 特殊成就：奖项/专利等（可选）

**消息生成层：**
根据上述要素随机组合生成消息

**质量控制层：**
每次生成前执行：
1. 检查历史记录
2. 确保技能/成果组合未重复
3. 确保所生成的新消息不包含最近8条已经发过的内容（包括但不限于职位名称）
4. 字数严格控制在10-40字
5. 避免感叹号等激进符号
6. 减少头衔“资深”、“高级”出现的频率，严禁出现“专家”、“老兵”；减少工作年限“x年”出现的频率

**输出格式：**
请确保仅回复一句话，以JSON响应，不要包含其他解释或内容；数据结构参考：\`{"response": "这里是将会发送给招聘者的内容"}\``
  },
  open: {
    fileName: 'auto-reminder-open-message-template.md',
    content:
      '请根据我的简历，帮我写一句谦逊有礼貌的开场白。开头包含“您好”等类似敬语、结尾包含“期待回复”等类似话术。不必包含简历中的具体内容，但需要表达出应聘意向。请确保仅响应一句话，以JSON响应；数据结构参考：`{"response": "这里是将会发送给招聘者的内容"}`'
  },
  dynamicChat: {
    fileName: 'dynamic-hr-chat-system-message-template.md',
    content: `你是一个真实求职者（非AI），正在BOSS直聘与招聘方即时沟通。

【求职者基本画像与意向】：
- 身份状态、经历特长与求职偏好由下方【简历参考】动态驱动，请严格根据真实简历信息如实作答，严禁编造。
- 若招聘方询问到岗时间或求职状态，结合自身实际情况坦诚协商沟通（如：“可根据录用流程及个人安排协商，预计近期/两周内可到岗”）。

【岗位匹配度与背景契合审查】：
请务必结合上方注入的【职位背景】（职位名称、薪资待遇、岗位职责要求等）与沟通历史进行判定：
- 严格遵循真实背景沟通，若发现岗位要求与自身实际背景（如经验年限、技术栈方向）存在明显冲突，坦诚说明并礼貌沟通。
- 【处置规则】：若岗位要求明显不匹配（例如明确要求与自身背景不符的多年全职经验或不对口专业）：
  - 严禁盲目虚构经历应聘，严禁调用 send_resume 发送不匹配的简历。
  - 必须礼貌得体地委婉沟通（控制在 20~50 字以内），例如：“您好，仔细阅读了岗位要求，可能与我目前的求职方向及背景不太契合，非常感谢您的关注，祝您招聘顺利！”

【沟通要求与原则】：
1. 第一人称“我”，态度自然随和、真诚得体，严禁AI套话与长篇大论，控制在 15~60 字以内。
2. 结合下方简历参考中的技能与经历如实作答，切勿编造虚构经历。
3. 【禁止盲目承诺与弱势表态】：
   - 严禁擅自替求职者做出过度确定性承诺（到岗时间表述为：可根据录用流程及个人安排协商到岗，预计近期/两周内可到岗）。
   - 严禁擅自替求职者答应或确认具体面试时间。凡涉及确认面试时间或面试邀约，必须调用 \`send_email_to_candidate\` 通知本人核对日程。
   - 聚焦核心技术与项目优势，严禁过度谄媚或主动暴露无关劣势（如“掌握少但愿意学”等弱势表态）。
4. 【可选择不回复】：若招聘方发来的消息属于对话自然闭环（如仅发了“好的”、“收到”、“谢谢”、“祝好”等），且当前无需继续追问或强行回复，请直接输出空内容，系统将保持安静、不向招聘方发送任何消息。
5. 【动作规范与联系方式处理 - 引导在平台沟通】：
   - 【索要微信/电话/联系方式处置】：招聘方提出交换微信/电话、索要联系方式、或出现交换联系方式系统卡片时，【严禁私自给联系方式】，也【不要调用发邮件工具】！直接礼貌回复婉拒加微信，并引导在平台内沟通（例如：“您好，麻烦您直接在 BOSS 直聘平台沟通即可，有相关要求或面试安排我们可以先在平台交流，谢谢理解！”）。特别是上来未聊简历/职位直接索要微信的，多为垃圾引流，坚决在平台沟通。
   - 【索要简历处置】：若招聘方明确索要简历（如“发份简历”、“发PDF/Word”、“看下简历”等），必须调用 \`send_resume\` 工具。
   - 【邮件通知仅限复杂决策与面试邀约】：仅当 HR 提出超出 Agent 知识范围的复杂考核要求、约定/确认面试时间（无论线上视频面还是现场面）、发起面试邀约等必须求职者本人亲自决策的事项时，才调用 \`send_email_to_candidate\`。严禁擅自替求职者答应或确认具体面试时间。
6. 普通对话请直接回复短句。

简历参考：
${RESUME_PLACEHOLDER}`
  }
}

export const getValidTemplate = async ({ type }) => {
  let template = await readStorageFile(defaultPromptMap[type].fileName, { isJson: false })
  if (!template) {
    await writeDefaultAutoRemindPrompt({ type })
    template = defaultPromptMap[type].content
  }
  if (['rechat', 'dynamicChat'].includes(type) && !template.includes(RESUME_PLACEHOLDER)) {
    const e = new Error(`简历内容占位符字符串不存在。占位字符串是 ${RESUME_PLACEHOLDER}`)
    e.name = `RESUME_PLACEHOLDER_NOT_EXIST`
    throw e
  }
  return template
}

export const writeDefaultAutoRemindPrompt = async ({ type }) => {
  switch (type) {
    case 'rechat':
      await writeStorageFile(defaultPromptMap[type].fileName, defaultPromptMap[type].content, {
        isJson: false
      })
      break
    case 'open':
      await writeStorageFile(defaultPromptMap[type].fileName, defaultPromptMap[type].content, {
        isJson: false
      })
      break
    case 'dynamicChat':
      await writeStorageFile(defaultPromptMap[type].fileName, defaultPromptMap[type].content, {
        isJson: false
      })
      break
  }
}

export const requestNewMessageContent = async (
  chatRecords,
  {
    requestScene,
    llmConfigIdForPick,
    jobInfoText
  }: {
    requestScene?: RequestSceneEnum
    llmConfigIdForPick?: string[]
    jobInfoText?: string
  } = {}
) => {
  const systemMessageTemplate = await getValidTemplate({ type: 'rechat' })
  const resumeObject = (await readConfigFile('resumes.json'))?.[0]
  const resumeContent = formatResumeJsonToMarkdown(resumeObject)
  const chatList = [
    {
      role: 'system',
      content: systemMessageTemplate.replace(RESUME_PLACEHOLDER, resumeContent)
    }
  ]

  // 注入当前沟通岗位上下文（保持 systemPrompt 静态缓存命中率）
  if (jobInfoText?.trim()) {
    chatList.push({
      role: 'user',
      content: `请知悉当前沟通的职位背景：\n${jobInfoText.trim()}`
    })
    chatList.push({
      role: 'assistant',
      content: '已充分了解当前应聘职位的要求与背景，我会结合自身真实经历真诚沟通。'
    })
  }

  const openMessageTemplate = await getValidTemplate({ type: 'open' })
  chatList.push({
    role: 'user',
    content: openMessageTemplate
  })
  // chatRecords = chatRecords.slice(chatRecords.length - _index)
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
        '围绕我简历中关于自我介绍、技术栈、工作经历、项目描述、项目业绩等内容，写一句自我介绍。开头不必包含“您好”、结尾不必包含“期待回复”；务必确保本次所回复的内容不能与之前所回复的内容雷同或相似。请确保仅回复一句话，以JSON响应，不要包含其他解释或内容；数据结构参考：`{"response": "这里是将会发送给招聘者的内容"}`'
    })
  }
  console.log(chatList)
  let res, llmConfig
  const llmRequestRecord: Omit<LlmModelUsageRecord, 'id' | 'providerApiSecretMd5'> & {
    providerApiSecret: string
  } = {}
  const blockModelSet = new Set()
  while (!res) {
    let llmConfigList = await readConfigFile('llm.json')
    if (llmConfigIdForPick?.length) {
      llmConfigList = llmConfigList.filter((it) => {
        return llmConfigIdForPick.includes(it.id)
      })
    }
    llmConfig = pickLlmConfigFromList(llmConfigList, blockModelSet)
    if (!llmConfig) {
      throw new Error(`CANNOT_FIND_A_USABLE_MODEL`)
    }
    console.log(llmConfig.providerCompleteApiUrl)
    Object.assign(llmRequestRecord, {
      providerCompleteApiUrl: llmConfig.providerCompleteApiUrl,
      model: llmConfig.model,
      providerApiSecret: llmConfig.providerApiSecret,
      requestStartTime: new Date(),
      hasError: false,
      errorMessage: '',
      requestScene
    })
    try {
      const completion = await completes(
        {
          baseURL: process.env.OPENAI_BASE_URL || llmConfig.providerCompleteApiUrl,
          apiKey: process.env.OPENAI_API_KEY || llmConfig.providerApiSecret,
          model: process.env.LLM_MODEL || llmConfig.model
        },
        chatList
      )
      res = completion?.choices?.[0] ?? null
      Object.assign(llmRequestRecord, {
        completionTokens: completion.usage?.completion_tokens ?? null,
        promptCacheHitTokens: completion.usage?.prompt_cache_hit_tokens ?? null,
        promptCacheMissTokens: completion.usage?.prompt_cache_miss_tokens ?? null,
        promptTokens: completion.usage?.prompt_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null
      } as LlmModelUsageRecord)
    } catch (err) {
      console.log('request failed', err)
      blockModelSet.add(llmConfig.id)
      Object.assign(llmRequestRecord, {
        hasError: true,
        errorMessage: err?.message ?? ''
      })
    } finally {
      llmRequestRecord.requestEndTime = new Date()
      try {
        await recordGptCompletionRequest(llmRequestRecord)
      } catch (err) {
        console.log('CANNOT_SAVE_LLM_COMPLETION_LOG', err)
      }
    }
  }
  console.log(res)
  // _index++
  let textToSend
  try {
    const rawMarkdownText = res?.message?.content
    try {
      textToSend = JSON.parse(
        rawMarkdownText.replace(/^```json/m, '').replace(/```$/m, '')
      )?.response
    } catch (err) {
      gtag('encounter_error_when_parse_llm_text', {
        err,
        model: llmConfig?.model,
        providerCompleteApiUrl: llmConfig?.providerCompleteApiUrl
      })
      throw err
    }
    textToSend = textToSend?.replace(/。$/, '')
    if (!textToSend) {
      gtag('llm_respond_text_is_empty', {
        model: llmConfig?.model,
        providerCompleteApiUrl: llmConfig?.providerCompleteApiUrl
      })
      throw new Error(`empty content. ${err?.message} ${res?.message?.content}`)
    }
  } catch (err) {
    throw new Error(`fail to parse response. ${err?.message} ${res?.message?.content}`)
  }
  return {
    responseText: textToSend,
    usedLlmConfig: llmConfig,
    recordInfo: llmRequestRecord
  }
}

export async function getGptContent(chatRecords, jobInfoText?: string) {
  const textToSend = (
    await requestNewMessageContent(chatRecords, {
      requestScene: RequestSceneEnum.readNoReplyAutoReminder,
      jobInfoText
    })
  ).responseText
  return textToSend
}

export async function sendMessage(page: Page, textToSend: string) {
  const cleanText = textToSend?.trim() || ''
  if (!cleanText) return

  const chatInputSelector = `.chat-conversation .message-controls .chat-input`
  const chatInputHandle = await page.$(chatInputSelector)
  if (!chatInputHandle) {
    console.warn('[sendMessage] 未找到聊天输入框')
    return
  }

  // 1. 聚焦并使用原生 execCommand 一次性原子化注入文本，彻底杜绝逐字打字导致的光标中途跳回行首与乱序
  await page.evaluate((selector, text) => {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) return
    el.focus()
    document.execCommand('selectAll', false, undefined)
    document.execCommand('delete', false, undefined)
    document.execCommand('insertText', false, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, chatInputSelector, cleanText)

  await sleepWithRandomDelay(800, 1200)

  // 2. 点击发送按钮或回车
  const sendButtonSelector = `.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)`
  const sendButton = await page.$(sendButtonSelector)
  if (sendButton) {
    await sendButton.click()
  } else {
    await page.keyboard.press('Enter')
  }
}

/**
 * 直接通过输入框工具栏发简历，并在弹窗中确认发送
 */
export async function sendResumeViaToolbar(page: Page): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. 定位并点击“发简历”按钮（双保险：d-c 埋点属性 + 工具栏精确文字匹配）
    const clicked = await page.evaluate(() => {
      // 方式 1: 尝试官方埋点属性
      const btnByDc = document.querySelector<HTMLElement>('.chat-controls [d-c="62009"], .chat-editor [d-c="62009"]')
      if (btnByDc && btnByDc.offsetParent !== null) {
        btnByDc.click()
        return true
      }

      // 方式 2: 兜底逻辑——限定在工具栏内，严格按文字精确匹配“发简历”
      const toolbarButtons = Array.from(
        document.querySelectorAll<HTMLElement>('.chat-controls .toolbar-btn, .chat-editor .toolbar-btn, .chat-controls div')
      )
      const btnByText = toolbarButtons.find((el) => {
        const text = (el.textContent || '').replace(/\s+/g, '')
        return (text === '发简历' || text === '发送简历') && el.offsetParent !== null
      })

      if (btnByText) {
        btnByText.click()
        return true
      }

      return false
    })

    if (!clicked) {
      console.warn('[sendResumeViaToolbar] 未找到发简历按钮')
      return { success: false, error: 'RESUME_BUTTON_NOT_FOUND' }
    }

    console.log('[sendResumeViaToolbar] 成功点击“发简历”按钮')
    await sleepWithRandomDelay(800, 1200)

    // 2. 检查并点击确认弹窗 / 气泡确认框中的“确定”或“发送”按钮
    let confirmed = false
    for (let attempt = 0; attempt < 3; attempt++) {
      const clickedConfirm = await page.evaluate(() => {
        // 查找所有可见的弹窗/气泡容器
        const popoverContainers = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.panel-resume, .sentence-popover, .dialog-wrap, .dialog-container, div[class*="popover"], div[class*="dialog"]'
          )
        ).filter((el) => el.offsetParent !== null)

        // 优先在可见容器中根据文本匹配确认按钮（“确定” / “发送” 等）
        for (const container of popoverContainers) {
          const clickableElements = Array.from(
            container.querySelectorAll<HTMLElement>('.btn-sure-v2, .btn-sure, .btn-primary, button, span, a, div')
          )
          const target = clickableElements.find((el) => {
            const text = el.textContent?.trim() || ''
            return ['确定', '发送', '确认发送', '确定发送', '确认'].includes(text) && el.offsetParent !== null
          })

          if (target) {
            target.click()
            return true
          }
        }

        // 兜底逻辑：直接按常见类名匹配
        const directBtn = document.querySelector<HTMLElement>(
          '.sentence-popover .btn-sure-v2, .panel-resume .btn-sure-v2, .dialog-wrap .btn-sure-v2, .dialog-wrap .btn-primary'
        )
        if (directBtn && directBtn.offsetParent !== null) {
          directBtn.click()
          return true
        }

        return false
      })

      if (clickedConfirm) {
        console.log('[sendResumeViaToolbar] 检测到发送简历确认弹窗并成功点击“确定”')
        confirmed = true
        break
      }

      await sleep(500)
    }

    if (!confirmed) {
      console.log('[sendResumeViaToolbar] 未弹出二次确认框或已自动发送')
    }

    await sleepWithRandomDelay(1000, 1500)

    // 3. 验证发送结果：检查是否存在报错 Toast 或消息列表变化
    const verifyResult = await page.evaluate(() => {
      const toastEl = document.querySelector('.boss-toast, .toast-box, .el-message')
      const toastText = toastEl?.textContent?.trim() || ''
      if (toastText && (toastText.includes('上限') || toastText.includes('失败') || toastText.includes('超限') || toastText.includes('不可'))) {
        return { success: false, error: toastText }
      }
      return { success: true, error: null }
    })

    if (!verifyResult.success && verifyResult.error) {
      console.warn('[sendResumeViaToolbar] 发送简历受限或失败:', verifyResult.error)
      return { success: false, error: verifyResult.error }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[sendResumeViaToolbar] 发送简历异常:', err)
    return { success: false, error: err?.message || String(err) }
  }
}

export const RESUME_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'send_resume',
    description: '当且仅当招聘者/HR在对话中明确提出索要简历、发一份简历、看下简历、发PDF、发word、互换简历等需求时调用。',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: '触发发送简历的原因或HR诉求摘要'
        },
        reply_message: {
          type: 'string',
          description: '伴随发送简历时附带回复给HR的自然简短文字，例如：好的，简历已发送给您，请您查阅！'
        }
      },
      required: ['reply_message']
    }
  }
}

export const getEmailForwardToolDefinition = (customReplyMessage?: string) => ({
  type: 'function' as const,
  function: {
    name: 'send_email_to_candidate',
    description:
      '当HR提出约定/确认面试时间（无论线上视频面还是现场面）、发起面试邀约、或提出超出当前Agent能力范围的要求（如布置Demo/上机实操题、索要特定数据等需要求职者本人亲自决策的事项）时调用此工具向求职者发送邮件通知。注意：索要微信/电话请直接回复文本引导在平台沟通，严禁调用此工具。',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            '触发发邮件的具体原因或HR核心诉求摘要（例如：HR发起面试邀约/约定面试时间、HR布置实操Demo题等）'
        },
        reply_message: {
          type: 'string',
          description: customReplyMessage?.trim()
            ? `回复给HR的告知话术，建议为：${customReplyMessage.trim()}`
            : '当前为静默模式，无需回复HR，固定传空字符串即可'
        }
      },
      required: ['reason']
    }
  }
})

export const EMAIL_FORWARD_TOOL_DEFINITION = getEmailForwardToolDefinition()

/**
 * 纯原生 Node.js TLS 极速 SMTP 发信实现
 * 零外部依赖，100% 脱离任何 IDE/CLI 环境，在任意独立 Bash/终端下稳定可用
 */
export function sendEmailViaNativeSMTP({
  host = 'smtp.qq.com',
  port = 465,
  user,
  pass,
  to,
  subject,
  html
}: {
  host?: string
  port?: number
  user: string
  pass: string
  to: string
  subject: string
  html: string
}): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false })

    let step = 0
    let buffer = ''

    function sendCommand(cmd: string) {
      socket.write(cmd + '\r\n')
    }

    socket.on('data', (data: Buffer) => {
      const response = data.toString()
      buffer += response

      if (step === 0 && response.startsWith('220')) {
        step = 1
        sendCommand('EHLO localhost')
      } else if (step === 1 && response.includes('250')) {
        step = 2
        sendCommand('AUTH LOGIN')
      } else if (step === 2 && response.startsWith('334')) {
        step = 3
        sendCommand(Buffer.from(user).toString('base64'))
      } else if (step === 3 && response.startsWith('334')) {
        step = 4
        sendCommand(Buffer.from(pass).toString('base64'))
      } else if (step === 4 && response.startsWith('235')) {
        step = 5
        sendCommand(`MAIL FROM:<${user}>`)
      } else if (step === 5 && response.startsWith('250')) {
        step = 6
        sendCommand(`RCPT TO:<${to}>`)
      } else if (step === 6 && response.startsWith('250')) {
        step = 7
        sendCommand('DATA')
      } else if (step === 7 && response.startsWith('354')) {
        step = 8
        const cleanSubject = subject.replace(/[\r\n]+/g, ' ')
        const encodedSubject = `=?UTF-8?B?${Buffer.from(cleanSubject).toString('base64')}?=`
        const base64Body = Buffer.from(html, 'utf-8')
          .toString('base64')
          .replace(/(.{76})/g, '$1\r\n')

        const mailContent = [
          `From: "求职Agent助理" <${user}>`,
          `To: <${to}>`,
          `Subject: ${encodedSubject}`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          '',
          base64Body,
          '.',
          ''
        ].join('\r\n')

        socket.write(mailContent)
      } else if (step === 8 && response.startsWith('250')) {
        step = 9
        sendCommand('QUIT')
        resolve({ success: true })
      } else if (response.startsWith('5') || response.startsWith('4')) {
        reject(new Error(`SMTP Error: ${response.trim()}`))
      }
    })

    socket.on('error', (err: any) => {
      reject(err)
    })

    socket.on('end', () => {
      if (step < 8) {
        reject(new Error('SMTP connection closed unexpectedly'))
      }
    })
  })
}

/**
 * 异步发送邮件通知给候选人
 * 使用纯原生 Node.js TLS 直连 QQ SMTP，零外部 CLI 依赖，跨终端稳定生效
 */
export const sendAgentNotificationEmail = async ({
  to,
  subject,
  html,
  body
}: {
  to: string
  subject: string
  html?: string
  body?: string
}): Promise<{ success: boolean; error?: string }> => {
  const content = html || body || ''
  if (!content.trim()) {
    return { success: false, error: 'EMPTY_CONTENT' }
  }

  const bossConf = readConfigFile('boss.json')?.autoReminder || {}
  const smtpUser = process.env.SMTP_USER || bossConf.smtpUser || bossConf.notifyEmail || ''
  const smtpPass = process.env.SMTP_PASS || bossConf.smtpPass || ''
  const smtpHost = process.env.SMTP_HOST || bossConf.smtpHost || 'smtp.qq.com'
  const smtpPort = Number(process.env.SMTP_PORT || bossConf.smtpPort || 465)

  if (!smtpUser || !smtpPass) {
    console.warn('[sendAgentNotificationEmail] 未配置 SMTP 凭证 (请在 .env 或 boss.json 中设置 SMTP_USER / SMTP_PASS)')
    return { success: false, error: 'MISSING_SMTP_CREDENTIALS' }
  }

  try {
    await sendEmailViaNativeSMTP({
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      to: to || smtpUser,
      subject,
      html: content
    })
    console.log(`[sendAgentNotificationEmail] 邮件已成功通过原生 QQ SMTP 直连发送给 ${to || smtpUser}`)
    return { success: true }
  } catch (err: any) {
    console.error('[sendAgentNotificationEmail] 原生 SMTP 直连发送失败:', err)
    return { success: false, error: err?.message || String(err) }
  }
}

/**
 * 请求大模型生成针对 HR 回复的拟人化多轮对话内容，并支持 send_resume 与 send_email_to_candidate Tool 调用
 */
export const requestDynamicDialogueReply = async (
  chatRecords: Array<{ isSelf: boolean; text?: string; messageType?: string }>,
  {
    llmConfigIdForPick,
    enableSendResumeTool = true,
    enableEmailForwardTool = true,
    enableDoNothing = true,
    jobInfoText,
    emailForwardReplyMessage
  }: {
    llmConfigIdForPick?: string[]
    enableSendResumeTool?: boolean
    enableEmailForwardTool?: boolean
    enableDoNothing?: boolean
    jobInfoText?: string
    emailForwardReplyMessage?: string
  } = {}
): Promise<{
  action: 'send_text' | 'send_resume' | 'send_email' | 'do_nothing'
  textToSend: string
  reason?: string
  usedLlmConfig?: any
}> => {
  let systemMessageTemplate = await getValidTemplate({ type: 'dynamicChat' })
  if (!enableDoNothing) {
    // 若未启用静默不回复，将提示词中的不回复规则替换为始终礼貌回应
    systemMessageTemplate = systemMessageTemplate.replace(
      /4\.\s*【可选择不回复】[^\n]*\n?/i,
      '4. 【保持沟通】：请始终礼貌随和地回应 HR 的最新消息，表达感谢或保持联系。\n'
    )
  }
  const resumeObject = (await readConfigFile('resumes.json'))?.[0]
  const resumeContent = formatResumeJsonToMarkdown(resumeObject)
  const chatList: Array<{ role: string; content: string }> = [
    {
      role: 'system',
      content: systemMessageTemplate.replace(RESUME_PLACEHOLDER, resumeContent)
    }
  ]

  // 注入当前沟通岗位上下文（保持 systemPrompt 静态缓存命中率）
  if (jobInfoText?.trim()) {
    chatList.push({
      role: 'user',
      content: `请知悉当前沟通的职位背景：\n${jobInfoText.trim()}`
    })
    chatList.push({
      role: 'assistant',
      content: '已充分了解当前应聘职位的要求与背景，我会结合自身真实经历真诚沟通。'
    })
  }

  // 组装历史多轮上下文：按照大模型原生 role 协议（assistant = 我方求职者，user = 招聘方 HR / 系统卡片）
  for (const record of chatRecords) {
    const text = record.text?.trim() || ''
    if (!text) continue

    if (record.isSelf) {
      chatList.push({
        role: 'assistant',
        content: text
      })
    } else {
      const isSystem = (record as any).isSystem || record.messageType === 'dialog' || record.messageType === 'system'
      chatList.push({
        role: 'user',
        content: isSystem ? `[系统通知: ${text}]` : text
      })
    }
  }

  // 保证末尾至少有一条 user 消息
  if (chatList.at(-1)?.role !== 'user') {
    chatList.push({
      role: 'user',
      content: '你好，请问你目前还在看工作机会吗？'
    })
  }

  let res: any = null
  let llmConfig: any = null
  const llmRequestRecord: Omit<LlmModelUsageRecord, 'id' | 'providerApiSecretMd5'> & {
    providerApiSecret: string
  } = {} as any
  const blockModelSet = new Set()

  while (!res) {
    let llmConfigList = await readConfigFile('llm.json')
    if (llmConfigIdForPick?.length) {
      llmConfigList = llmConfigList.filter((it: any) => llmConfigIdForPick.includes(it.id))
    }
    llmConfig = pickLlmConfigFromList(llmConfigList, blockModelSet)
    if (!llmConfig) {
      throw new Error(`CANNOT_FIND_A_USABLE_MODEL`)
    }

    Object.assign(llmRequestRecord, {
      providerCompleteApiUrl: llmConfig.providerCompleteApiUrl,
      model: llmConfig.model,
      providerApiSecret: llmConfig.providerApiSecret,
      requestStartTime: new Date(),
      hasError: false,
      errorMessage: '',
      requestScene: RequestSceneEnum.readNoReplyAutoReminder
    })

    try {
      const completesParams: any = {
        baseURL: process.env.OPENAI_BASE_URL || llmConfig.providerCompleteApiUrl,
        apiKey: process.env.OPENAI_API_KEY || llmConfig.providerApiSecret,
        model: process.env.LLM_MODEL || llmConfig.model
      }
      const tools: any[] = []
      if (enableSendResumeTool) {
        tools.push(RESUME_TOOL_DEFINITION)
      }
      if (enableEmailForwardTool) {
        tools.push(getEmailForwardToolDefinition(emailForwardReplyMessage))
      }
      if (tools.length) {
        completesParams.tools = tools
      }

      const completion = await completes(completesParams, chatList)
      res = completion?.choices?.[0] ?? null
      Object.assign(llmRequestRecord, {
        completionTokens: completion.usage?.completion_tokens ?? null,
        promptCacheHitTokens: completion.usage?.prompt_cache_hit_tokens ?? null,
        promptCacheMissTokens: completion.usage?.prompt_cache_miss_tokens ?? null,
        promptTokens: completion.usage?.prompt_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null
      } as LlmModelUsageRecord)
    } catch (err: any) {
      console.log('[dynamicChat] request failed', err)
      blockModelSet.add(llmConfig.id)
      Object.assign(llmRequestRecord, {
        hasError: true,
        errorMessage: err?.message ?? ''
      })
    } finally {
      llmRequestRecord.requestEndTime = new Date()
      try {
        await recordGptCompletionRequest(llmRequestRecord)
      } catch (err) {
        console.log('CANNOT_SAVE_LLM_COMPLETION_LOG', err)
      }
    }
  }

  const defaultEmailReply =
    '其实我只是一个agent，现在这个问题超出了我的能力范围，已通过邮箱发给候选人本人，如果有什么还想留言的，我也会转告'

  const safeParseJson = (str: any) => {
    try {
      return JSON.parse(str)
    } catch {
      return null
    }
  }

  // 解析结果：检查 tool_calls
  const choiceMessage = res?.message
  if (choiceMessage?.tool_calls?.length) {
    const resumeToolCall = choiceMessage.tool_calls.find((tc: any) => tc.function?.name === 'send_resume')
    if (resumeToolCall) {
      const args = safeParseJson(resumeToolCall.function?.arguments)
      return {
        action: 'send_resume',
        textToSend: args?.reply_message || '好的，简历已发送给您，请您查阅！',
        reason: args?.reason || 'hr_requested_resume',
        usedLlmConfig: llmConfig
      }
    }

    const emailToolCall = choiceMessage.tool_calls.find((tc: any) => tc.function?.name === 'send_email_to_candidate')
    if (emailToolCall) {
      const args = safeParseJson(emailToolCall.function?.arguments)
      const textToSend = typeof emailForwardReplyMessage === 'string'
        ? emailForwardReplyMessage.trim()
        : (args?.reply_message?.trim() || '')
      return {
        action: 'send_email',
        textToSend,
        reason: args?.reason || 'HR 提出了超出当前能力的诉求或要求邮件转告',
        usedLlmConfig: llmConfig
      }
    }
  }

  // 解析文本内容
  const rawText = choiceMessage?.content?.trim() || ''
  const parsed = safeParseJson(rawText.replace(/^```json/m, '').replace(/```$/m, ''))

  if (parsed?.action === 'send_email' || parsed?.name === 'send_email_to_candidate') {
    const textToSend = typeof emailForwardReplyMessage === 'string'
      ? emailForwardReplyMessage.trim()
      : (parsed.reply_message?.trim() || '')
    return { action: 'send_email', textToSend, reason: parsed.reason || '', usedLlmConfig: llmConfig }
  }
  if (parsed?.action === 'send_resume' || parsed?.name === 'send_resume') {
    return { action: 'send_resume', textToSend: parsed.reply_message || '好的，简历已发送给您，请您查阅！', reason: parsed.reason || '', usedLlmConfig: llmConfig }
  }

  let textToSend = (parsed?.response || rawText).replace(/^["'“”]/, '').replace(/["'“”]$/, '').trim()

  // 检查是否选择不回复（输出空白或显式静默指令）
  if (!textToSend || /^(无需回复|不回复|暂不回复|无)$/i.test(textToSend)) {
    if (!enableDoNothing) {
      return {
        action: 'send_text',
        textToSend: '好的，感谢您的沟通，后续有进展随时联系！',
        usedLlmConfig: llmConfig
      }
    }
    return {
      action: 'do_nothing',
      textToSend: '',
      usedLlmConfig: llmConfig
    }
  }

  return {
    action: 'send_text',
    textToSend,
    usedLlmConfig: llmConfig
  }
}

