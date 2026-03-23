import { spawn } from 'child_process'
import { platform } from 'os'

const isWindows = platform() === 'win32'
const packages = [
  'utils',
  'geek-auto-start-chat-with-boss',
  'dingtalk-plugin',
  'launch-bosszhipin-login-page-with-preload-extension',
  'laodeng',
  'pm',
  'run-core-of-geek-auto-start-chat-with-boss'
]

const watchProcesses: any[] = []

function startWatch(packageName: string) {
  const child = spawn(
    isWindows ? 'pnpm.cmd' : 'pnpm',
    ['--filter', `@geekgeekrun/${packageName === 'laodeng' ? 'puppeteer-extra-plugin-laodeng' : packageName}`, 'dev'],
    {
      stdio: 'inherit',
      shell: isWindows
    }
  )
  
  child.on('error', (err) => {
    console.error(`Failed to start watch for ${packageName}:`, err)
  })
  
  watchProcesses.push(child)
  console.log(`Started watch for ${packageName}`)
}

function cleanup() {
  console.log('\nStopping all watch processes...')
  watchProcesses.forEach((child) => {
    child.kill('SIGTERM')
  })
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

console.log('Starting watch mode for all dependencies...')
packages.forEach(startWatch)

console.log('\nAll dependencies are now in watch mode.')
console.log('Press Ctrl+C to stop all watch processes.\n')

process.stdin.resume()
