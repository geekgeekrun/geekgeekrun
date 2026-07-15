export async function bootstrap({ browserRuntime, taskReporter }) {
  if (!browserRuntime || typeof browserRuntime.bootstrap !== 'function') throw Object.assign(new Error('Read-no-reply browser runtime is unavailable'), { code: 'BROWSER_UNAVAILABLE' })
  return browserRuntime.bootstrap({ taskReporter })
}

export async function launchBoss({ browserRuntime, browser, taskReporter }) {
  if (!browserRuntime || typeof browserRuntime.launchBoss !== 'function') throw Object.assign(new Error('Read-no-reply Boss runtime is unavailable'), { code: 'BROWSER_UNAVAILABLE' })
  return browserRuntime.launchBoss({ browser, taskReporter })
}
