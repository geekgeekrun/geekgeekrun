export function createTextMessage (text) {
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

export async function requestDingtalkNotify (dingTalkAccessToken, body) {
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
