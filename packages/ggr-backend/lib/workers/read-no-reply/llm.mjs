import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { completes } from '../../../../utils/gpt-request.mjs'
import { createRuntimePaths } from '../../runtime-paths.mjs'

const RESUME_PLACEHOLDER = '__REPLACE_REAL_RESUME_HERE__'
export const defaultPromptMap = Object.freeze({
  rechat: { fileName: 'auto-reminder-resume-system-message-template.md', content: `**核心指令：**
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
请确保仅回复一句话，以JSON响应，不要包含其他解释或内容；数据结构参考：\`{"response": "这里是将会发送给招聘者的内容"}\`` },
  open: { fileName: 'auto-reminder-open-message-template.md', content: '请根据我的简历，帮我写一句谦逊有礼貌的开场白。开头包含“您好”等类似敬语、结尾包含“期待回复”等类似话术。不必包含简历中的具体内容，但需要表达出应聘意向。请确保仅响应一句话，以JSON响应；数据结构参考：`{"response": "这里是将会发送给招聘者的内容"}`' }
})

async function readText(file) { try { return await fs.readFile(file, 'utf8') } catch (error) { if (error?.code === 'ENOENT') return ''; throw error } }
export async function writeDefaultAutoRemindPrompt({ type, runtimePaths = createRuntimePaths(os.homedir()) }) {
  const prompt = defaultPromptMap[type]
  if (!prompt) throw new TypeError(`Unsupported prompt type: ${type}`)
  await fs.mkdir(runtimePaths.storageDir, { recursive: true, mode: 0o700 })
  await fs.writeFile(path.join(runtimePaths.storageDir, prompt.fileName), prompt.content, { mode: 0o600 })
}
export async function getValidTemplate({ type, runtimePaths = createRuntimePaths(os.homedir()) }) {
  const prompt = defaultPromptMap[type]
  if (!prompt) throw new TypeError(`Unsupported prompt type: ${type}`)
  let content = await readText(path.join(runtimePaths.storageDir, prompt.fileName))
  if (!content) { await writeDefaultAutoRemindPrompt({ type, runtimePaths }); content = prompt.content }
  if (type === 'rechat' && !content.includes(RESUME_PLACEHOLDER)) throw Object.assign(new Error(`简历内容占位符字符串不存在。占位字符串是 ${RESUME_PLACEHOLDER}`), { name: 'RESUME_PLACEHOLDER_NOT_EXIST' })
  return content
}

function resumeMarkdown(resume) {
  const content = resume?.content ?? {}
  return [`# 姓名\n${content.name ?? ''}`, `# 个人优势\n${content.userDescription ?? ''}`,
    ...(content.geekWorkExpList ?? []).map((item) => `## ${item.company ?? ''}\n${item.workDescription ?? ''}\n${item.performance ?? ''}`),
    ...(content.geekProjExpList ?? []).map((item) => `## ${item.name ?? ''}\n${item.projectDescription ?? ''}\n${item.performance ?? ''}`)].join('\n\n')
}

export async function requestNewMessageContent(chatRecords = [], { llmConfigIdForPick, runtimePaths = createRuntimePaths(os.homedir()), settings, recordUsage = async () => {}, complete = completes } = {}) {
  const llmConfigs = settings?.llm ?? JSON.parse(await fs.readFile(path.join(runtimePaths.configDir, 'llm.json'), 'utf8'))
  if (llmConfigs.length === 1) Object.assign(llmConfigs[0], { enabled: true, serveWeight: 1 })
  const configs = llmConfigs.filter((item) => item.enabled && (!llmConfigIdForPick?.length || llmConfigIdForPick.includes(item.id)))
  const resumes = JSON.parse(await fs.readFile(path.join(runtimePaths.configDir, 'resumes.json'), 'utf8'))
  const system = (await getValidTemplate({ type: 'rechat', runtimePaths })).replace(RESUME_PLACEHOLDER, resumeMarkdown(resumes?.[0]))
  const messages = [{ role: 'system', content: system }, { role: 'user', content: await getValidTemplate({ type: 'open', runtimePaths }) }]
  for (const record of chatRecords) {
    messages.push({ role: 'assistant', content: `\`\`\`json\n${JSON.stringify({ response: record.text })}\n\`\`\`` })
    messages.push({ role: 'user', content: '围绕我简历中关于自我介绍、技术栈、工作经历、项目描述、项目业绩等内容，写一句自我介绍。开头不必包含“您好”、结尾不必包含“期待回复”；务必确保本次所回复的内容不能与之前所回复的内容雷同或相似。请确保仅回复一句话，以JSON响应，不要包含其他解释或内容；数据结构参考：`{"response": "这里是将会发送给招聘者的内容"}`' })
  }
  let lastError
  const remaining = [...configs]
  while (remaining.length) {
    const pool = remaining.flatMap((config) => Array(Math.max(1, Math.min(100, Math.floor(Number(config.serveWeight) || 1)))).fill(config))
    const config = pool[Math.floor(Math.random() * pool.length)]
    const usageRecord = { providerCompleteApiUrl: config.providerCompleteApiUrl, model: config.model, providerApiSecret: config.providerApiSecret, requestStartTime: new Date(), hasError: false, errorMessage: '' }
    try {
      const completion = await complete({ baseURL: config.providerCompleteApiUrl, apiKey: config.providerApiSecret, model: config.model }, messages)
      const raw = completion?.choices?.[0]?.message?.content ?? ''
      const responseText = JSON.parse(raw.replace(/^```json\s*/m, '').replace(/```$/m, '')).response?.replace(/。$/, '')
      if (!responseText) throw new Error('empty LLM response')
      Object.assign(usageRecord, { requestEndTime: new Date(), completionTokens: completion.usage?.completion_tokens ?? null, promptTokens: completion.usage?.prompt_tokens ?? null, totalTokens: completion.usage?.total_tokens ?? null })
      await Promise.resolve().then(() => recordUsage(usageRecord)).catch(() => console.error('CANNOT_SAVE_LLM_COMPLETION_LOG'))
      return { responseText, usedLlmConfig: config, recordInfo: usageRecord }
    } catch (error) {
      lastError = error
      Object.assign(usageRecord, { requestEndTime: new Date(), hasError: true, errorMessage: error instanceof Error ? error.message : String(error) })
      await recordUsage(usageRecord).catch(() => {})
      remaining.splice(remaining.indexOf(config), 1)
    }
  }
  throw Object.assign(lastError ?? new Error('CANNOT_FIND_A_USABLE_MODEL'), { code: 'LLM_UNAVAILABLE' })
}
export async function getGptContent(chatRecords, options) { return (await requestNewMessageContent(chatRecords, options)).responseText }
export async function sendMessage(page, text) {
  const input = await page.$('.chat-conversation .message-controls .chat-input')
  await input?.click(); await input?.type(text, { delay: 50 })
  await page.click('.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)')
}
export async function sendLookForwardReplyEmotion(page) {
  await (await page.$('.chat-conversation .message-controls .btn-emotion'))?.click()
  await (await page.$('.chat-conversation .message-controls .emotion .emotion-tab .emotion-sort:nth-child(3)'))?.click()
  await (await page.$('.chat-conversation .message-controls .emotion .emotion-box img[title=盼回复]'))?.click()
}
