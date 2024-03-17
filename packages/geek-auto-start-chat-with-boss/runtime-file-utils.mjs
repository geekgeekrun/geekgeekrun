import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import defaultDingtalkConf from './default-config-file/dingtalk.json' assert {type: 'json'}
import defaultBossConf from './default-config-file/boss.json' assert {type: 'json'}
import defaultTargetCompanyListConf from './default-config-file/target-company-list.json' assert {type: 'json'}

import defaultBossCookieStorage from './default-storage-file/boss-cookies.json' assert { type: 'json' }
import defaultBossLocalStorageStorage from './default-storage-file/boss-local-storage.json' assert { type: 'json' }
export const configFileNameList = ['boss.json', 'dingtalk.json', 'target-company-list.json']

const defaultConfigFileContentMap = {
  'boss.json': JSON.stringify(defaultBossConf),
  'dingtalk.json': JSON.stringify(defaultDingtalkConf),
  'target-company-list.json': JSON.stringify(defaultTargetCompanyListConf)
}

const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
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

export const configFolderPath = path.join(
  runtimeFolderPath,
  'config'
)
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
    ensureConfigFileExist()
    o = JSON.parse(defaultConfigFileContentMap[fileName])
  }

  return o
}

export const writeConfigFile = async (fileName, content) => {
  const filePath = path.join(configFolderPath, fileName)
  const fileContent = JSON.stringify(content)
  return fsPromise.writeFile(
    filePath,
    fileContent
  )
}

export const storageFilePath = path.join(
  runtimeFolderPath,
  'storage'
)
export const storageFileNameList = ['boss-cookies.json', 'boss-local-storage.json']

const defaultStorageFileContentMap = {
  'boss-cookies.json': JSON.stringify(defaultBossCookieStorage),
  'boss-local-storage.json': JSON.stringify(defaultBossLocalStorageStorage)
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

export const readStorageFile = (fileName) => {
  const joinedPath = path.join(storageFilePath, fileName)

  if (!fs.existsSync(
    joinedPath
  )) {
    ensureStorageFileExist()
  }

  let o
  try {
    o = JSON.parse(
      fs.readFileSync(joinedPath)
    )
  } catch {
    fs.existsSync(joinedPath) && fs.unlinkSync(joinedPath)
    ensureStorageFileExist()
    o = JSON.parse(defaultStorageFileContentMap[fileName])
  }

  return o
}

export const writeStorageFile = async (fileName, content) => {
  const filePath = path.join(storageFilePath, fileName)
  const fileContent = JSON.stringify(content)
  return fsPromise.writeFile(
    filePath,
    fileContent
  )
}

export const getPublicDbFilePath = () => {
  return path.join(storageFilePath, 'public.db')
}