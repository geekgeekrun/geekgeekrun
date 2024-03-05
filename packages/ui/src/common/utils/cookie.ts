export const checkCookieListFormat = (cookies: Array<Record<string, string>>) => {
  const allExpectKeySet = new Set([
    'name',
    'value',
    'domain',
    'path',
    'secure',
    'session',
    'httpOnly'
  ])
  return Array.isArray(cookies) &&
    cookies.length &&
    cookies.every((it) => {
      const currentOwnedKeySet = new Set(Object.keys(it))
      if (currentOwnedKeySet.size < allExpectKeySet.size) {
        return false
      }

      const allExpectKeyArr = [...allExpectKeySet]
      for (let i = 0; i < allExpectKeyArr.length; i++) {
        if (!currentOwnedKeySet.has(allExpectKeyArr[i])) {
          return false
        }
      }
      return true
    })
}
