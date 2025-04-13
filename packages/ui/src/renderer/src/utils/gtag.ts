export function gtagRenderer(name, params: any = null) {
  try {
    electron.ipcRenderer.send('gtag', {
      name,
      params: {
        ...(params ?? {}),
        user_agent: navigator.userAgent,
        current_href: location.href,
        screen_w: window.screen?.width ?? null,
        screen_h: window.screen?.height ?? null,
        screen_dpr: window.devicePixelRatio
      }
    })
  } catch (err) {
    console.log('gtag error', err)
  }
}
