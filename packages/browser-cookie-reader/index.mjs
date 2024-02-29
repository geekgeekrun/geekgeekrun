import path from 'node:path'
import os from 'os'
import sqlite3 from 'sqlite3'

/**
 * 
 * @param {string} filePath 
 * @returns {Promise<sqlite3.Database>}
 */
const connectDb = (filePath) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(filePath, (err) => {
    if (!err) {
      resolve(db)
    } else {
      reject(err)
    }
  })
})

let cookieDbFilePath
const osType = os.platform()

if (osType === 'win32') {}
else if (osType === 'darwin') {
  cookieDbFilePath = path.join(os.homedir(), '/Library/Application Support/Google/Chrome/Default/Cookies')
}
else if (osType === 'linux') {
}
else {

}
(async () => {
  const db = await connectDb(cookieDbFilePath)
  db.run(`SELECT * FROM 'cookies'`, (err) => {
    console.log(err)
    debugger
  })
})()

setTimeout(() => void 0, 3600 * 1000 * 24)