import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import defaultDingtalkConf from './default-config-file/dingtalk.json' assert {type: 'json'}
import defaultBossConf from './default-config-file/boss.json' assert {type: 'json'}
import defaultTargetCompanyListConf from './default-config-file/target-company-list.json' assert {type: 'json'}

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
  ;['config'].forEach(dirPath => {
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
  if (!fs.existsSync(
    path.join(configFolderPath, fileName)
  )) {
    ensureConfigFileExist()
  }

  let o
  try {
    o = JSON.parse(
      fs.readFileSync(path.join(configFolderPath, fileName))
    )
  } catch {
    fs.unlinkSync(fs.readFileSync(path.join(configFolderPath, fileName)))
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

