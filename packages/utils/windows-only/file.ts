import * as childProcess from 'node:child_process'

export const getExecutableFileVersion = async (p: string): Promise<string | undefined> => {
  const path = await import('node:path/win32')
  p = path.resolve(p).split('\\').join('\\\\')
  return new Promise((resolve, reject) => {
    childProcess.exec(
      `wmic datafile where Name="${p}" get Version /format:list`,
      (err, stdout) => {
        if (err) {
          console.log(err)
          reject(err)
        } else {
          const lines = stdout.trim().split('\n').map(it => it.split('='))
          const versionLine = lines.find(ln => ln[0] === 'Version')
          resolve(versionLine?.[1])
        }
      }
    )
  })
}
