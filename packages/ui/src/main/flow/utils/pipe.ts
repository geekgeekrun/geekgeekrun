import * as net from 'net'

export const pipeWriteRegardlessError = (
  pipe: net.Socket | null,
  ...writeArgs: Parameters<net.Socket['write']>
) => {
  try {
    pipe?.write(...writeArgs)
  } catch (error) {
    console.log('pipe.write Error', error)
  }
}
