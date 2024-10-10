import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import App from './App.vue'
import router from './router'
import 'normalize.css'
import './style/public.scss'
import 'element-plus/dist/index.css'
import 'virtual:uno.css'
import 'animate.css'

createApp(App)
  .use(router)
  .use(ElementPlus)
  .mount('#app')
