export function sleep(t: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, t)
  })
}

export function sleepWithRandomDelay(base: number): Promise<void> {
  return sleep(base + Math.random() * 1000)
}
