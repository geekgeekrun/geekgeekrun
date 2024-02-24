import * as fs from 'fs'

export const pipeWriteRegardlessError = async (
  pipe: fs.WriteStream | null,
  chunk: unknown,
  option?
) => {
  return new Promise((resolve) => {
    // debugger
    pipe?.write(chunk, option, (error) => {
      if (error) {
        console.log('pipe.write Error', error)
      }
      resolve(undefined)
    })
  })
}
