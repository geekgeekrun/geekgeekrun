import OpenAI from "openai";

/**
 * 调用 Chat Completions API，支持推理模型（thinking 参数）。
 *
 * @param {{ baseURL: string, apiKey: string, model: string, max_tokens?: number, temperature?: number, thinking?: { enabled?: boolean, budget?: number } }} config
 * @param {Array<{ role: string, content: string }>} messages
 */
export async function completes(
  {
    baseURL,
    apiKey,
    model,
    max_tokens,
    temperature,
    thinking,
    response_format
  },
  messages
) {
  const openai = new OpenAI({
    baseURL,
    apiKey,
  });

  const isThinking = !!(thinking?.enabled && thinking?.budget)

  // 推理模型开启 thinking 时，max_tokens 必须大于 thinking_budget，否则会因长度上限截断 JSON。
  // 调用方若未显式传 max_tokens，按是否启用 thinking 给一个安全的默认值。
  const resolvedMaxTokens =
    typeof max_tokens === 'number'
      ? max_tokens
      : isThinking
        ? 8192
        : 1200

  // temperature：推理模型启用 thinking 时建议 ≥0.5（部分 provider 限制），普通 JSON 输出用 0.1。
  const resolvedTemperature =
    typeof temperature === 'number'
      ? temperature
      : isThinking
        ? 0.6
        : 0.1

  const createParams = {
    messages,
    model,
    max_tokens: resolvedMaxTokens,
    temperature: resolvedTemperature,
  }

  if (isThinking) {
    // SiliconFlow / 火山方舟等兼容顶层参数；OpenAI SDK 通过 extra_body 透传其他字段
    createParams.enable_thinking = true
    createParams.thinking_budget = thinking.budget
  }

  if (response_format) {
    createParams.response_format = response_format
  }

  const completion = await openai.chat.completions.create(createParams);

  // reasoning_content 仅推理模型填充，普通模型为 undefined
  const msg = completion.choices[0].message
  if (msg.reasoning_content) {
    console.log('[gpt-request] reasoning_content:', String(msg.reasoning_content ?? '').slice(0, 200))
  }
  console.log('[gpt-request] content:', (msg.content ?? '').slice(0, 200));
  return completion;
}