import * as path from 'node:path';
import type typeormType from 'typeorm'
const isRunFromUi = Boolean(process.env.MAIN_BOSSGEEKGO_UI_RUN_MODE)
const isUiDev = process.env.NODE_ENV === 'development'

export function requireTypeorm () {
  let typeorm: typeof typeormType
  // production
  if (
    isRunFromUi && !isUiDev
  ) {
    const electron = require('electron')
    const runtimeDependencies = require(
      path.resolve(
        electron.app.getAppPath(),
        '..',
        'external-node-runtime-dependencies/index.cjs'
      )
    )
    typeorm = runtimeDependencies.typeorm
  } else {
    const importResult = require('typeorm')
    typeorm = importResult
  }
 
  return typeorm
}