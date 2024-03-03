import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import WaitForLogin from './index.vue'

export const mountGlobalDialog = () => {
  const containerElId = `elForWaitForLogin`

  if (document.getElementById(containerElId)) {
    return
  }
  let containerEl: null | HTMLElement = (() => {
    const el = document.createElement('div')
    el.id = containerElId
    return el
  })()
  document.body.append(containerEl)

  const dispose = () => {
    app?.unmount()
    containerEl?.remove()

    app = null
    containerEl = null
  }
  let app: null | ReturnType<typeof createApp> = createApp(WaitForLogin, {
    modelValue: true,
    onClosed() {
      dispose()
    },
    dispose,
  }).use(ElementPlus)
  app.mount(containerEl)

  return {
    dispose
  }
}
