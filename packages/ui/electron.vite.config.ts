import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { presetUno, presetAttributify, presetIcons } from 'unocss'
import transformerDirective from "@unocss/transformer-directives";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['puppeteer', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth', '@puppeteer/browsers']
      }
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@geekgeekrun/geek-auto-start-chat-with-boss', '@geekgeekrun/dingtalk-plugin']
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
      vue(),
      UnoCSS({
        presets: [presetUno(), presetAttributify(), presetIcons()],
        transformers: [transformerDirective()],
      })
    ],
  }
})
