export * from './runtime-file-utils'
export * from './constant'
export * from './combineCalculator'
export * from './sage-time'
export * from './cityGroup'

import {
  sleep,
  sleepWithRandomDelay
} from '@geekgeekrun/utils'

import { EventEmitter } from 'node:events'

export { sleep, sleepWithRandomDelay }

export const autoStartChatEventBus = new EventEmitter()

let puppeteer: any
let StealthPlugin: any
let LaodengPlugin: any
let AnonymizeUaPlugin: any

export async function initPuppeteer () {
  const importResult = await Promise.all(
    [
      import('puppeteer-extra'),
      import('puppeteer-extra-plugin-stealth'),
      import('@geekgeekrun/puppeteer-extra-plugin-laodeng'),
      import('puppeteer-extra-plugin-anonymize-ua')
    ]
  )
  puppeteer = importResult[0].default
  StealthPlugin = importResult[1].default
  LaodengPlugin = importResult[2].default
  AnonymizeUaPlugin = importResult[3].default
  puppeteer.use(StealthPlugin())
  puppeteer.use(LaodengPlugin())
  puppeteer.use(AnonymizeUaPlugin({ makeWindows: false }))
  return {
    puppeteer,
    StealthPlugin,
    LaodengPlugin,
    AnonymizeUaPlugin
  }
}

export async function mainLoop(hooks: any): Promise<void> {
  // Placeholder - actual implementation in original file
}

export function closeBrowserWindow(): void {
  // Placeholder - actual implementation in original file
}
