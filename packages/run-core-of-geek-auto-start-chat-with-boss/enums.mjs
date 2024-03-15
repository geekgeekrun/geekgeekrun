export const AUTO_CHAT_ERROR_EXIT_CODE = (() => {
  const enums = {
    NORMAL: 0,
    COOKIE_INVALID: 81,
    LOGIN_STATUS_INVALID: 82,
    ERR_INTERNET_DISCONNECTED: 83,
    ACCESS_IS_DENIED: 84,
    PUPPETEER_IS_NOT_EXECUTABLE: 85
  }
  const kvList = Object.entries(enums)
  
  kvList.forEach(([k, v]) => {
    enums[v] = k
  })

  return enums
})()