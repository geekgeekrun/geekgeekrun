import OpenAI from "openai";


const GPT_API_KEY = `sk-40fdef46fee24402bc05311304fce7a1`
export async function completes(messages) {
  const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: GPT_API_KEY
  });

  const completion = await openai.chat.completions.create({
    messages,
    model: "deepseek-chat",
    frequency_penalty: 0,
    max_tokens: 100,
    temperature: 0.2
  });

  console.log(completion.choices[0].message.content);
  return completion.choices?.[0] ?? null;
}