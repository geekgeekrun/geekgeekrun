import * as fs from 'fs'
import { type Stream } from 'stream'
import { app } from 'electron'
const pipeSet = new WeakSet<Stream>()

export const pipeWriteRegardlessError = async (
  pipe: fs.WriteStream | null,
  chunk: unknown,
  option?
) => {
  if (pipe && !pipeSet.has(pipe)) {
    pipeSet.add(pipe)
    pipe.on('error', (error) => {
      void error
    })
  }
  return pipe?.write(chunk, option, (error) => {
    if (error) {
      console.log('pipe.write Error', error)
      app.exit(1)
      process.exit(1)
    }
  })
}
