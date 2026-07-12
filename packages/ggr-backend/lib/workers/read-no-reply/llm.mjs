import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { completes } from '../../../../utils/gpt-request.mjs'
import { createRuntimePaths } from '../../runtime-paths.mjs'

const RESUME_PLACEHOLDER = '__REPLACE_REAL_RESUME_HERE__'
export const defaultPromptMap = Object.freeze({
  rechat: { fileName: 'auto-reminder-resume-system-message-template.md', content: `请严格根据以下简历写一句10-40字、谦逊且不重复的求职跟进消息。只返回 {"response":"..."}。\n${RESUME_PLACEHOLDER}` },
  open: { fileName: 'auto-reminder-open-message-template.md', content: '请写一句谦逊有礼貌的求职开场白，只返回 {"response":"..."}。' }
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
  for (const record of chatRecords) messages.push({ role: record.isSelf === false ? 'user' : 'assistant', content: String(record.text ?? '') })
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
      await recordUsage(usageRecord)
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
