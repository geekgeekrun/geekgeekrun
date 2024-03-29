export const measureExecutionTime = async <
  T extends Promise<unknown> | ((...args: unknown[]) => unknown),
  U = T extends Promise<unknown>
    ? T
    : T extends (...args: unknown[]) => unknown
      ? ReturnType<T>
      : never
>(
  promiseOrFunction: T
): Promise<U> => {
  const startTime = new Date()
  if (promiseOrFunction instanceof Promise) {
    await promiseOrFunction
    console.log(`execution duration ${Number(new Date()) - Number(startTime)}ms`)
    return promiseOrFunction as U
  } else {
    const result = await promiseOrFunction()
    console.log(`execution duration ${Number(new Date()) - Number(startTime)}ms`)
    return result as U
  }
}
