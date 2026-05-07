export function buildPosterHrTitleRegExp({ isPosterHrFilterEnabled, posterHrTitleRegExpStr }) {
  if (!isPosterHrFilterEnabled || !posterHrTitleRegExpStr?.trim()) {
    return null
  }
  try {
    return new RegExp(posterHrTitleRegExpStr, 'im')
  } catch {
    return null
  }
}

export function testIfPosterTitleSuit(bossInfo, { isPosterHrFilterEnabled, posterHrTitleRegExpStr }) {
  const posterHrTitleRegExp = buildPosterHrTitleRegExp({
    isPosterHrFilterEnabled,
    posterHrTitleRegExpStr,
  })
  if (!isPosterHrFilterEnabled || !posterHrTitleRegExp) {
    return true
  }
  const posterTitle = bossInfo?.title?.trim?.() ?? ''
  if (!posterTitle) {
    return false
  }
  return posterHrTitleRegExp.test(posterTitle)
}
