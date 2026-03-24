import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { presetUno, presetAttributify, presetIcons } from 'unocss'
import transformerDirective from '@unocss/transformer-directives'
import Replace from 'unplugin-replace/vite'

process.env = { ...process.env, ...loadEnv(process.env.NODE_ENV!, process.cwd()) }
const mainPlugins = [
  externalizeDepsPlugin({
    // 显式排除所有 workspace 包，让 Vite 正确处理它们的导出
    exclude: [
      '@geekgeekrun/dingtalk-plugin',
      '@geekgeekrun/sqlite-plugin',
      '@geekgeekrun/geek-auto-start-chat-with-boss',
      '@geekgeekrun/utils',
      '@geekgeekrun/launch-bosszhipin-login-page-with-preload-extension',
      '@geekgeekrun/puppeteer-extra-plugin-laodeng',
      '@geekgeekrun/pm',
      '@geekgeekrun/run-core-of-geek-auto-start-chat-with-boss'
    ]
  }),
  Replace({
    delimiters: ['', ''],
    sourcemap: true,
    include: ['**/src/main/utils/gtag/Analytics.ts'],
    values: [
      {
        find: /<measurement_id>/g,
        replacement: process.env.VITE_APP_GTAG_MEASUREMENT_ID as string
      },
      {
        find: /<api_secret>/g,
        replacement: process.env.VITE_APP_GTAG_API_SECRET as string
      }
    ]
  })
]
const preloadPlugins = [externalizeDepsPlugin()]
const rendererPlugins = [
  vue(),
  UnoCSS({
    presets: [presetUno(), presetAttributify(), presetIcons()],
    transformers: [transformerDirective()]
  })
]
if (process.env.NODE_ENV) {
  ;[mainPlugins, preloadPlugins, rendererPlugins].forEach((pluginList) => {
    pluginList.push(
      Replace({
        delimiters: ['', ''],
        sourcemap: true,
        include: ['**'],
        values: [
          {
            find: /process.env.NODE_ENV/g,
            replacement: `'${process.env.NODE_ENV}'` as string
          }
        ]
      })
    )
  })
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: [
          /^@geekgeekrun\//,
          'find-chrome-bin',
          'better-sqlite3',
          'typeorm'
        ]
      },
      minify: process.env.NODE_ENV === 'development' ? undefined : 'terser',
      watch: process.env.NODE_ENV === 'development' ? {} : undefined
    },
    plugins: mainPlugins
  },
  preload: {
    plugins: preloadPlugins,
    build: {
      minify: process.env.NODE_ENV === 'development' ? undefined : 'terser',
      watch: process.env.NODE_ENV === 'development' ? {} : undefined
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        'diff': 'diff'
      }
    },
    optimizeDeps: {
      include: [
        'diff',
        '@geekgeekrun/utils',
        '@geekgeekrun/utils/sleep',
        '@geekgeekrun/utils/date',
        '@geekgeekrun/utils/number',
        '@geekgeekrun/utils/gpt-request',
        '@geekgeekrun/utils/legacy-path',
        '@geekgeekrun/geek-auto-start-chat-with-boss',
        '@geekgeekrun/geek-auto-start-chat-with-boss/cityGroup',
        '@geekgeekrun/geek-auto-start-chat-with-boss/constant',
        '@geekgeekrun/geek-auto-start-chat-with-boss/combineCalculator',
        '@geekgeekrun/geek-auto-start-chat-with-boss/sage-time',
        '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils',
        '@geekgeekrun/sqlite-plugin',
        '@geekgeekrun/sqlite-plugin/enums',
        '@geekgeekrun/sqlite-plugin/handlers'
      ]
    },
    plugins: rendererPlugins,
    build: {
      minify: process.env.NODE_ENV === 'development' ? undefined : 'terser'
    }
  }
})
