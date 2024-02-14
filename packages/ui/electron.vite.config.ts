import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['puppeteer', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth', '@puppeteer/browsers']
      }
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@bossgeekgo/geek-auto-start-chat-with-boss', '@bossgeekgo/dingtalk-plugin']
      })
    ]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [
      vue()
    ]
  }
})
