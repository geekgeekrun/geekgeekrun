export function sleep (t) {
  return new Promise(resolve => {
    setTimeout(resolve, t)
  })
}

export function sleepWithRandomDelay (min, max) {
  const lo = min ?? 0
  const hi = max ?? (lo + 1000)
  return sleep(lo + Math.random() * (hi - lo))
}