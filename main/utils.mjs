export function sleep (t) {
  return new Promise(resolve => {
    setTimeout(resolve, t)
  })
}

export function sleepWithRandomDelay (base) {
  return sleep(base + Math.random()*1000)
}