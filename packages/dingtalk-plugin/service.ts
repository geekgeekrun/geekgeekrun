export function createTextMessage(text: string) {
  return {
    "dingtalkRequestBody": {
      "msgtype": "text",
      "text": {
        "content": `${text}`
      },
    },
    insertedTime: new Date(),
  }
}

export async function requestDingtalkNotify(dingTalkAccessToken: string, body: string) {
  const url = new URL(`https://oapi.dingtalk.com/robot/send`)
  url.searchParams.append(
    'access_token',
    dingTalkAccessToken
  )

  return await fetch(
    url,
    {
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    }
  )
}
