function required(runtime, method) {
  if (!runtime || typeof runtime[method] !== 'function') throw Object.assign(new Error(`Read-no-reply operation is unavailable: ${method}`), { code: 'WORKER_RUNTIME_UNAVAILABLE' })
  return runtime[method].bind(runtime)
}

export function createBossOperations(runtime) {
  return Object.freeze({
    getGptContent: required(runtime, 'getGptContent'),
    sendLookForwardReplyEmotion: required(runtime, 'sendLookForwardReplyEmotion'),
    sendMessage: required(runtime, 'sendMessage')
  })
}
