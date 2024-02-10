export function createTextMessage (text) {
  return JSON.stringify({
    "msgtype": "text",
    "text": {
      "content": `${text}【geekgo】`
    }
  })
}

export async function requestDingTalkNotify (dingTalkAccessToken, body) {
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
