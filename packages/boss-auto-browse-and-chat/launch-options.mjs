/**
 * boss-recruiter.json `advanced` section schema:
 * {
 *   "advanced": {
 *     "persistProfile": false   // opt-in: persist Chromium profile across launches (better anti-detection;
 *                               //         BUT cannot run BOSS in system Chrome simultaneously)
 *   }
 * }
 */

import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { readConfigFile, storageFilePath } from './runtime-file-utils.mjs'

const VIEWPORT_POOL = [
  { w: 1366, h: 768 },
  { w: 1440, h: 900 - 140 },
  { w: 1536, h: 864 },
  { w: 1600, h: 900 },
  { w: 1680, h: 1050 - 150 }
]

const DEFAULT_VIEWPORT = { width: 1440, height: 760 }

function pickViewportForPath(seed) {
  const digest = crypto.createHash('md5').update(seed).digest()
  const intVal = digest.readInt32BE(0)
  const idx = Math.abs(intVal) % VIEWPORT_POOL.length
  const picked = VIEWPORT_POOL[idx]
  return { width: picked.w, height: picked.h }
}

/**
 * Build the puppeteer.launch() options object for the recruiter side.
 * Reads boss-recruiter.json's `advanced` section for opt-in features.
 *
 * @param {object} [overrides] - shallow-merged onto the result (e.g. { headless: false } for force)
 * @returns {Promise<import('puppeteer').LaunchOptions>}
 */
export async function buildRecruiterLaunchOptions(overrides = {}) {
  const cfg = readConfigFile('boss-recruiter.json') || {}
  const advanced = cfg.advanced || {}
  const persistProfile = advanced.persistProfile === true

  const headless = process.env.HEADLESS === '1'

  let userDataDir
  let viewport
  if (persistProfile) {
    userDataDir = path.join(storageFilePath, 'boss-chrome-profile')
    fs.mkdirSync(userDataDir, { recursive: true })
    viewport = pickViewportForPath(userDataDir)
  } else {
    viewport = { ...DEFAULT_VIEWPORT }
  }

  const args = ['--lang=zh-CN', '--disable-blink-features=AutomationControlled']

  const opts = {
    headless,
    ignoreHTTPSErrors: true,
    protocolTimeout: 120000,
    defaultViewport: viewport,
    args: [...args]
  }
  if (userDataDir) opts.userDataDir = userDataDir
  return { ...opts, ...overrides }
}
