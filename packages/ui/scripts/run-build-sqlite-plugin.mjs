import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..', '..', '..')
const sqlitePluginDir = resolve(rootDir, 'packages', 'sqlite-plugin')

console.log('Building sqlite-plugin...')

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
