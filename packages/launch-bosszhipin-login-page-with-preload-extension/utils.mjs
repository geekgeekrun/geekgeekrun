import path from 'node:path';
import fs from 'node:fs'
import os from 'node:os'
import extractZip from 'extract-zip'
import packageJson from './package.json' assert {type: 'json'}

const isUiDev = process.env.NODE_ENV === 'development'

export const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')

const extensionDir = path.join(
  runtimeFolderPath,
  'chrome-extensions'
)
if (!fs.existsSync(
  runtimeFolderPath
)) {
  fs.mkdirSync(runtimeFolderPath)
}
if (!fs.existsSync(extensionDir)) {
  fs.mkdirSync(extensionDir)
}
export const editThisCookieExtensionPath = path.join(extensionDir, 'EditThisCookie')

let editThisCookieZipPath
async function getEditThisCookieZipPath () {
  if (editThisCookieZipPath) {
    return editThisCookieZipPath
  }
  const { app } = await import('electron')
  editThisCookieZipPath = path.join(app.getAppPath(), './node_modules', packageJson.name, 'extensions', 'EditThisCookie.zip')
  return editThisCookieZipPath
}

export async function ensureEditThisCookie () {
  let isNeedExtractEditThisCookie = false
  const manifestFilePath = path.join(editThisCookieExtensionPath, 'manifest.json')
  if (!fs.existsSync(
    manifestFilePath
  )) {
    isNeedExtractEditThisCookie = true
  } else {
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFilePath, { encoding: 'utf-8' }))
      if (!manifest.manifest_version || manifest.manifest_version <= 2) {
        isNeedExtractEditThisCookie = true
      }
    }
    catch {
      console.log(`未能获取到文件内容`)
      isNeedExtractEditThisCookie = true
    }
  }

  if (isNeedExtractEditThisCookie) {
    if (
      fs.existsSync(
        editThisCookieExtensionPath
      )
    ) {
      fs.rmSync(
        editThisCookieExtensionPath,
        {
          recursive: true,
          force: true
        }
      )
    }
    await extractZip(
      await getEditThisCookieZipPath(),
      {
        dir: extensionDir
      }
    )
  }
}