import * as fs from 'fs'
import { type Stream } from 'stream'
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
    }
  })
}
