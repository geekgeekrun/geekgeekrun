import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { presetUno, presetAttributify, presetIcons } from 'unocss'
import transformerDirective from '@unocss/transformer-directives'
import Replace from 'unplugin-replace/vite'

process.env = { ...process.env, ...loadEnv(process.env.NODE_ENV!, process.cwd()) }
function externalizeMainBareImportsPlugin() {
  return {
    name: 'externalize-main-bare-imports',
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (!id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0')) {
        return { id, external: true }
      }
      return null
    }
  }
}

const mainPlugins = [
  externalizeMainBareImportsPlugin(),
  externalizeDepsPlugin(),
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
        external: []
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
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: rendererPlugins,
    build: {
      minify: process.env.NODE_ENV === 'development' ? undefined : 'terser'
    }
  }
})
