import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import defaultDingtalkConf from './default-config-file/dingtalk.json' with {type: 'json'}
import defaultBossConf from './default-config-file/boss.json' with {type: 'json'}
import defaultTargetCompanyListConf from './default-config-file/target-company-list.json' with {type: 'json'}
import defaultLlmConf from './default-config-file/llm.json' with { type: 'json' }

import defaultBossCookieStorage from './default-storage-file/boss-cookies.json' with { type: 'json' }
import defaultBossLocalStorageStorage from './default-storage-file/boss-local-storage.json' with { type: 'json' }
import defaultJobNotSuitReasonCodeToTextCacheStorage from './default-storage-file/job-not-suit-reason-code-to-text-cache.json' with { type: 'json' }
import defaultCommonJobConditionConfig from './default-config-file/common-job-condition-config.json' with { type: 'json' }
export const configFileNameList = ['boss.json', 'dingtalk.json', 'target-company-list.json', 'llm.json', 'common-job-condition-config.json']

const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600

const defaultConfigFileContentMap = {
  'boss.json': JSON.stringify(defaultBossConf),
  'dingtalk.json': JSON.stringify(defaultDingtalkConf),
  'target-company-list.json': JSON.stringify(defaultTargetCompanyListConf),
  'llm.json': JSON.stringify(defaultLlmConf),
  'common-job-condition-config.json': JSON.stringify(defaultCommonJobConditionConfig)
}
const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
export const configFolderPath = path.join(
  runtimeFolderPath,
  'config'
)
const chmodSyncQuietly = (filePath, mode) => {
  try {
    fs.chmodSync(filePath, mode)
  } catch {}
}

const backupCorruptFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.renameSync(filePath, `${filePath}.corrupt-${timestamp}.bak`)
}

const ensurePrivateDirSync = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: PRIVATE_DIR_MODE })
  }
  chmodSyncQuietly(dirPath, PRIVATE_DIR_MODE)
}

const writePrivateFileSync = (filePath, content) => {
  ensurePrivateDirSync(path.dirname(filePath))
  fs.writeFileSync(filePath, content, { mode: PRIVATE_FILE_MODE })
  chmodSyncQuietly(filePath, PRIVATE_FILE_MODE)
}

const writePrivateFile = async (filePath, content) => {
  await fsPromise.mkdir(path.dirname(filePath), { recursive: true, mode: PRIVATE_DIR_MODE })
  await fsPromise.chmod(path.dirname(filePath), PRIVATE_DIR_MODE).catch(() => {})
  await fsPromise.writeFile(filePath, content, { mode: PRIVATE_FILE_MODE })
  await fsPromise.chmod(filePath, PRIVATE_FILE_MODE).catch(() => {})
}

export const writeConfigFile = async (fileName, content, { isSync } = {}) => {
  const filePath = path.join(configFolderPath, fileName)
  const fileContent = JSON.stringify(content)
  if (isSync) {
    writePrivateFileSync(filePath, fileContent)
  }
  else {
    return writePrivateFile(filePath, fileContent)
  }
}
if (
  !fs.existsSync(
    path.join(configFolderPath, 'common-job-condition-config.json')
  )
) {
  let bossConfig = null
  if (
    fs.existsSync(
      path.join(configFolderPath, 'boss.json')
    )
  ) {
    fs.existsSync(
      path.join(configFolderPath, 'boss.json')
    )
    try {
      bossConfig = JSON.parse(
        fs.readFileSync(
          path.join(configFolderPath, 'boss.json')
        )
      )
    }
    catch {}
  }
  if (bossConfig) {
    Object.keys(defaultCommonJobConditionConfig).forEach(
      key => {
        if (Object.hasOwn(bossConfig, key)) {
          defaultCommonJobConditionConfig[key] = bossConfig[key]
        }
      }
    )
    let {
      expectJobRegExpStr,
      expectJobNameRegExpStr,
      expectJobTypeRegExpStr,
      expectJobDescRegExpStr,
    } = bossConfig
    if (
      expectJobRegExpStr &&
      !expectJobNameRegExpStr &&
      !expectJobTypeRegExpStr &&
      !expectJobDescRegExpStr
    ) {
      expectJobNameRegExpStr = expectJobRegExpStr
      expectJobTypeRegExpStr = expectJobRegExpStr
      expectJobDescRegExpStr = expectJobRegExpStr
    }
    Object.assign(defaultCommonJobConditionConfig, {
      expectJobNameRegExpStr,
      expectJobTypeRegExpStr,
      expectJobDescRegExpStr
    })
  }
  let targetCompanyList = null
  if (
    fs.existsSync(
      path.join(configFolderPath, 'target-company-list.json')
    )
  ) {
    targetCompanyList = JSON.parse(
      fs.readFileSync(
        path.join(configFolderPath, 'target-company-list.json')
      )
    )
  }
  if (targetCompanyList) {
    defaultCommonJobConditionConfig.expectCompanies = targetCompanyList ?? []
  }
  writeConfigFile('common-job-condition-config.json', defaultCommonJobConditionConfig, { isSync: true })
  if (bossConfig) {
    if (!bossConfig.fieldsForUseCommonConfig) {
      bossConfig.fieldsForUseCommonConfig = {}
    }
    writeConfigFile('boss.json', bossConfig, { isSync: true })
  }
}

const ensureRuntimeFolderPathExist = () => {
  ensurePrivateDirSync(runtimeFolderPath)
  ;['config', 'storage'].forEach(dirPath => {
    ensurePrivateDirSync(path.join(runtimeFolderPath, dirPath))
  })
}
export const ensureConfigFileExist = () => {
  ensureRuntimeFolderPathExist()
  ;configFileNameList.forEach(
    fileName => {
      if (!fs.existsSync(
        path.join(configFolderPath, fileName)
      )) {
        writePrivateFileSync(
          path.join(configFolderPath, fileName),
          defaultConfigFileContentMap[fileName]
        )
      }
    }
  )
}

export const readConfigFile = (fileName) => {
  const joinedPath = path.join(configFolderPath, fileName)
  if (!fs.existsSync(
    joinedPath
  )) {
    ensureConfigFileExist()
  }

  let o
  try {
    chmodSyncQuietly(joinedPath, PRIVATE_FILE_MODE)
    o = JSON.parse(
      fs.readFileSync(joinedPath)
    )
  } catch {
    backupCorruptFile(joinedPath)
    if (defaultConfigFileContentMap[fileName]) {
      ensureConfigFileExist()
      o = JSON.parse(defaultConfigFileContentMap[fileName])
    } else {
      o = null
    }
  }

  return o
}

export const storageFilePath = path.join(
  runtimeFolderPath,
  'storage'
)
export const storageFileNameList = [
  'boss-cookies.json',
  'boss-local-storage.json',
  'job-not-suit-reason-code-to-text-cache.json'
]
const storageFileNameSet = new Set([
  ...storageFileNameList,
  'ipc-pipe-name',
  'auto-reminder-resume-system-message-template.md',
  'auto-reminder-open-message-template.md'
])

const defaultStorageFileContentMap = {
  'boss-cookies.json': JSON.stringify(defaultBossCookieStorage),
  'boss-local-storage.json': JSON.stringify(defaultBossLocalStorageStorage),
  'job-not-suit-reason-code-to-text-cache.json': JSON.stringify(defaultJobNotSuitReasonCodeToTextCacheStorage)
}
const getStorageFilePath = (fileName) => {
  if (!storageFileNameSet.has(fileName)) {
    throw new Error(`Unsupported storage file: ${fileName}`)
  }
  return path.join(storageFilePath, fileName)
}
export const ensureStorageFileExist = () => {
  ensureRuntimeFolderPathExist()
  ;storageFileNameList.forEach(
    fileName => {
      if (!fs.existsSync(
        path.join(storageFilePath, fileName)
      )) {
        writePrivateFileSync(
          path.join(storageFilePath, fileName),
          defaultStorageFileContentMap[fileName]
        )
      }
    }
  )
}

export const readStorageFile = (fileName, { isJson } = {}) => {
  isJson = isJson ?? true
  const joinedPath = getStorageFilePath(fileName)

  if (!fs.existsSync(
    joinedPath
  )) {
    ensureStorageFileExist()
  }

  let o
  try {
    chmodSyncQuietly(joinedPath, PRIVATE_FILE_MODE)
    const content = fs.readFileSync(joinedPath)
    if (isJson) {
      o = JSON.parse(content)
    }
    else {
      o = content.toString()
    }
  } catch {
    backupCorruptFile(joinedPath)
    ensureStorageFileExist()
    if (isJson) {
      o = JSON.parse(defaultStorageFileContentMap[fileName] ?? 'null')
    }
    else {
      o = defaultStorageFileContentMap[fileName] ?? null
    }
  }

  return o
}

export const writeStorageFile = async (fileName, content, { isJson } = {}) => {
  isJson = isJson ?? true
  const filePath = getStorageFilePath(fileName)
  let fileContent
  if (isJson) {
    fileContent = JSON.stringify(content)
  } else {
    fileContent = content
  }
  return writePrivateFile(filePath, fileContent)
}

export const getPublicDbFilePath = () => {
  return path.join(storageFilePath, 'public.db')
}
