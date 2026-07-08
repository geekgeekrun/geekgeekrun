import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalProcessController } from '../../ggr-controller/index.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function defaultRepoRoot() {
  return path.resolve(__dirname, '../../..')
}

export function createAgentService({ repoRoot = defaultRepoRoot() } = {}) {
  return createLocalProcessController({ repoRoot })
}
