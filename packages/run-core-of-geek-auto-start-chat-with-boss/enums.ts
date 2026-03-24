export const AUTO_CHAT_ERROR_EXIT_CODE = (() => {
  const enums = {
    NORMAL: 0,
    COOKIE_INVALID: 81,
    LOGIN_STATUS_INVALID: 82,
    ERR_INTERNET_DISCONNECTED: 83,
    ACCESS_IS_DENIED: 84,
    PUPPETEER_IS_NOT_EXECUTABLE: 85
  } as const
  
  const result: Record<string, number | string> & Record<number, string> = { ...enums }
  
  const kvList = Object.entries(enums)
  
  kvList.forEach(([k, v]) => {
    result[v] = k
  })

  return result as typeof enums & Record<number, string>
})()
