import { execSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..', '..', '..')
const sqlitePluginDir = resolve(rootDir, 'packages', 'sqlite-plugin')

const distDir = resolve(sqlitePluginDir, 'dist')
const srcDir = resolve(sqlitePluginDir, 'src')
const forceBuild = process.env.FORCE_BUILD_SQLITE_PLUGIN === '1'

const requiredFiles = [
  resolve(distDir, 'index.js'),
  resolve(distDir, 'index.cjs'),
  resolve(distDir, 'index.d.ts'),
  resolve(distDir, 'handlers.js'),
  resolve(distDir, 'handlers.cjs'),
  resolve(distDir, 'handlers.d.ts'),
  resolve(distDir, 'enums.js'),
  resolve(distDir, 'enums.cjs'),
  resolve(distDir, 'enums.d.ts')
]

const collectFiles = (dir) => {
  const out = []
  if (!existsSync(dir)) return out
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectFiles(fullPath))
    } else if (entry.isFile()) {
      out.push(fullPath)
    }
  }
  return out
}

const hasDualOutputInDir = (dir) => {
  if (!existsSync(dir)) return false
  const files = readdirSync(dir)
  const hasJs = files.some((f) => f.endsWith('.js'))
  const hasCjs = files.some((f) => f.endsWith('.cjs'))
  return hasJs && hasCjs
}

const shouldBuild = () => {
  if (forceBuild) return true

  for (const file of requiredFiles) {
    if (!existsSync(file)) return true
  }
  if (!hasDualOutputInDir(resolve(distDir, 'utils'))) return true
  if (!hasDualOutputInDir(resolve(distDir, 'entity'))) return true

  const srcFiles = collectFiles(srcDir)
  if (srcFiles.length === 0) return true

  const latestSrc = Math.max(...srcFiles.map((f) => statSync(f).mtimeMs))
  const outputFiles = [
    ...requiredFiles,
    ...collectFiles(resolve(distDir, 'utils')),
    ...collectFiles(resolve(distDir, 'entity'))
  ].filter((f) => existsSync(f))
  if (outputFiles.length === 0) return true
  const oldestOut = Math.min(...outputFiles.map((f) => statSync(f).mtimeMs))

  return latestSrc > oldestOut
}

if (!shouldBuild()) {
  console.log('sqlite-plugin build is up-to-date (ESM + CJS).')
  process.exit(0)
}

console.log('Building sqlite-plugin (ESM + CJS)...')

try {
  execSync('pnpm build', {
    cwd: sqlitePluginDir,
    stdio: 'inherit'
  })
  console.log('sqlite-plugin built successfully!')
} catch (error) {
  console.error('Failed to build sqlite-plugin:', error)
  process.exit(1)
}
