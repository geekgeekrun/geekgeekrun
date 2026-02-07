import path from 'node:path'
import os from 'node:os'

export const cacheDir = path.join(os.homedir(), '.geekgeekrun', 'cache')
