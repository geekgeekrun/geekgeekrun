import { createApp } from 'vue'
import ElementPlus, { ElMessage } from 'element-plus'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import 'normalize.css'
import './style/public.scss'
import 'element-plus/dist/index.css'
import 'virtual:uno.css'
import 'animate.css'

const pinia = createPinia()
createApp(App).use(pinia).use(router).use(ElementPlus).mount('#app')
electron.ipcRenderer.on('toast-message', (_, payload) => {
  ElMessage(payload)
})
