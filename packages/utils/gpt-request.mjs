import OpenAI from "openai";

export async function completes(
  {
    baseURL,
    apiKey,
    model
  },
  messages
) {
  const openai = new OpenAI({
    baseURL,
    apiKey,
  });

  const completion = await openai.chat.completions.create({
    messages,
    model,
    frequency_penalty: 0,
    max_tokens: 100,
    temperature: 0.1
  });

  console.log(completion.choices[0].message.content);
  return completion;
}