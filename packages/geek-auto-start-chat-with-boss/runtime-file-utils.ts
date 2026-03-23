import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export const configFileNameList = ['boss.json', 'dingtalk.json', 'target-company-list.json', 'llm.json', 'common-job-condition-config.json']

export const runtimeFolderPath = path.join(os.homedir(), '.geekgeekrun')
export const configFolderPath = path.join(
  runtimeFolderPath,
  'config'
)

export const writeConfigFile = async (fileName: string, content: any, { isSync }: { isSync?: boolean } = {}): Promise<void> => {
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
    ) as unknown as Promise<void>
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
          '{}'
        )
      }
    }
  )
}

export const readConfigFile = (fileName: string): any => {
  const joinedPath = path.join(configFolderPath, fileName)
  if (!fs.existsSync(
    joinedPath
  )) {
    ensureConfigFileExist()
  }

  let o: any
  try {
    o = JSON.parse(
      fs.readFileSync(joinedPath, 'utf-8')
    )
  } catch {
    fs.existsSync(joinedPath) && fs.unlinkSync(joinedPath)
    ensureConfigFileExist()
    o = {}
  }

  return o
}

export const storageFilePath = path.join(
  runtimeFolderPath,
  'storage'
)
export const storageFileNameList = ['boss-cookies.json', 'boss-local-storage.json', 'job-not-suit-reason-code-to-text-cache.json']

export const ensureStorageFileExist = () => {
  ensureRuntimeFolderPathExist()
  ;storageFileNameList.forEach(
    fileName => {
      if (!fs.existsSync(
        path.join(storageFilePath, fileName)
      )) {
        fs.writeFileSync(
          path.join(storageFilePath, fileName),
          '[]'
        )
      }
    }
  )
}

export const readStorageFile = (fileName: string, { isJson }: { isJson?: boolean } = {}): any => {
  isJson = isJson ?? true
  const joinedPath = path.join(storageFilePath, fileName)

  if (!fs.existsSync(
    joinedPath
  )) {
    ensureStorageFileExist()
  }

  let o: any
  try {
    const content = fs.readFileSync(joinedPath)
    if (isJson) {
      o = JSON.parse(content.toString())
    }
    else {
      o = content.toString()
    }
  } catch {
    fs.existsSync(joinedPath) && fs.unlinkSync(joinedPath)
    ensureStorageFileExist()
    o = isJson ? [] : ''
  }

  return o
}

export const writeStorageFile = async (fileName: string, content: any, { isJson }: { isJson?: boolean } = {}): Promise<void> => {
  isJson = isJson ?? true
  const filePath = path.join(storageFilePath, fileName)
  let fileContent: string
  if (isJson) {
    fileContent = JSON.stringify(content)
  } else {
    fileContent = content
  }
  return fsPromise.writeFile(
    filePath,
    fileContent
  ) as unknown as Promise<void>
}

export const getPublicDbFilePath = () => {
  return path.join(storageFilePath, 'public.db')
}
