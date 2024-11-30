import * as path from 'node:path';
const isRunFromUi = Boolean(process.env.MAIN_BOSSGEEKGO_UI_RUN_MODE)
const isUiDev = process.env.NODE_ENV === 'development'

export function requireTypeorm () {
  const importResult = require('typeorm')
  return importResult
}