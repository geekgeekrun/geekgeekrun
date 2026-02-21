import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import defaultDingtalkConf from './default-config-file/dingtalk.json' assert {type: 'json'}
import defaultBossConf from './default-config-file/boss.json' assert {type: 'json'}
import defaultTargetCompanyListConf from './default-config-file/target-company-list.json' assert {type: 'json'}
import defaultLlmConf from './default-config-file/llm.json' assert { type: 'json' }

import defaultBossCookieStorage from './default-storage-file/boss-cookies.json' assert { type: 'json' }
import defaultBossLocalStorageStorage from './default-storage-file/boss-local-storage.json' assert { type: 'json' }
import defaultJobNotSuitReasonCodeToTextCacheStorage from './default-storage-file/job-not-suit-reason-code-to-text-cache.json' assert { type: 'json' }
import defaultCommonJobConditionConfig from './default-config-file/common-job-condition-config.json' assert { type: 'json' }
export const configFileNameList = ['boss.json', 'dingtalk.json', 'target-company-list.json', 'llm.json', 'common-job-condition-config.json']

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
export const writeConfigFile = async (fileName, content, { isSync } = {}) => {
  const filePath = path.join(configFolderPath, fileName)
  const fileContent = JSON.stringify(content)
  if (isSync) {
    fs.writeFileSync(
      filePath,
      fileContent
    )
  }
  else {
    return fsPromise.writeFile(
      filePath,
      fileContent
    )
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
    Object.assign(bossConfig.fieldsForUseCommonConfig, {
      city: true,
      salary: true,
      jobDetail: true,
      blockCompanyNameRegExpStr: true,
      expectCompanies: true
    })
    writeConfigFile('boss.json', bossConfig, { isSync: true })
  }
}

const ensureRuntimeFolderPathExist = () => {
  if (!fs.existsSync(runtimeFolderPath)) {
    fs.mkdirSync(runtimeFolderPath)
  }
  ;['config', 'storage'].forEach(dirPath => {
    if (!fs.existsSync(
      path.join(runtimeFolderPath, dirPath)
    )) {
      fs.mkdirSync(
        path.join(runtimeFolderPath, dirPath)
      )
    }
  })
}
export const ensureConfigFileExist = () => {
  ensureRuntimeFolderPathExist()
  ;configFileNameList.forEach(
    fileName => {
      if (!fs.existsSync(
        path.join(configFolderPath, fileName)
      )) {
        fs.writeFileSync(
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
    o = JSON.parse(
      fs.readFileSync(joinedPath)
    )
  } catch {
    fs.existsSync(joinedPath) && fs.unlinkSync(joinedPath)
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
export const storageFileNameList = ['boss-cookies.json', 'boss-local-storage.json', 'job-not-suit-reason-code-to-text-cache.json']

const defaultStorageFileContentMap = {
  'boss-cookies.json': JSON.stringify(defaultBossCookieStorage),
  'boss-local-storage.json': JSON.stringify(defaultBossLocalStorageStorage),
  'job-not-suit-reason-code-to-text-cache.json': JSON.stringify(defaultJobNotSuitReasonCodeToTextCacheStorage)
}
export const ensureStorageFileExist = () => {
  ensureRuntimeFolderPathExist()
  ;storageFileNameList.forEach(
    fileName => {
      if (!fs.existsSync(
        path.join(storageFilePath, fileName)
      )) {
        fs.writeFileSync(
          path.join(storageFilePath, fileName),
          defaultStorageFileContentMap[fileName]
        )
      }
    }
  )
}

export const readStorageFile = (fileName, { isJson } = {}) => {
  isJson = isJson ?? true
  const joinedPath = path.join(storageFilePath, fileName)

  if (!fs.existsSync(
    joinedPath
  )) {
    ensureStorageFileExist()
  }

  let o
  try {
    const content = fs.readFileSync(joinedPath)
    if (isJson) {
      o = JSON.parse(content)
    }
    else {
      o = content.toString()
    }
  } catch {
    fs.existsSync(joinedPath) && fs.unlinkSync(joinedPath)
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
  const filePath = path.join(storageFilePath, fileName)
  let fileContent
  if (isJson) {
    fileContent = JSON.stringify(content)
  } else {
    fileContent = content
  }
  return fsPromise.writeFile(
    filePath,
    fileContent
  )
}

export const getPublicDbFilePath = () => {
  return path.join(storageFilePath, 'public.db')
}