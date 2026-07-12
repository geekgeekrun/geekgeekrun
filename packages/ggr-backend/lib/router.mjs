const handlers = new Map()

const invalidParams = (message) => Object.assign(new Error(message), { code: 'INVALID_PARAMS' })

function onlyKeys(params, allowed) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw invalidParams('RPC params must be an object')
  const unexpected = Object.keys(params).find((key) => !allowed.has(key))
  if (unexpected) throw invalidParams(`Unsupported parameter: ${unexpected}`)
  return params
}

export const register = (method, handler) => handlers.set(method, handler)

export async function dispatch(request, context) {
  const handler = context?.handlers?.get(request.method) ?? handlers.get(request.method)
  if (!handler) throw Object.assign(new Error(`Unknown method: ${request.method}`), { code: 'METHOD_NOT_FOUND' })
  return handler(request.params ?? {}, context)
}

export function createRouter(entries = []) {
  const localHandlers = new Map(entries)
  return {
    register(method, handler) { localHandlers.set(method, handler); return this },
    dispatch(request, context = {}) { return dispatch(request, { ...context, handlers: localHandlers }) }
  }
}

export function registerServiceHandlers(router, { methods, task, approval }) {
  return router
    .register(methods.TASK_LIST, (params) => {
      onlyKeys(params, new Set())
      return task.list()
    })
    .register(methods.TASK_START, (params) => {
      onlyKeys(params, new Set(['workerId', 'options']))
      return task.start(params)
    })
    .register(methods.TASK_STOP, (params) => {
      onlyKeys(params, new Set(['workerId']))
      return task.stop(params)
    })
    .register(methods.APPROVAL_LIST, (params) => {
      onlyKeys(params, new Set(['includeAll']))
      if (params.includeAll !== undefined && typeof params.includeAll !== 'boolean') throw invalidParams('includeAll must be a boolean')
      return approval.list({ includeAll: params.includeAll })
    })
    .register(methods.APPROVAL_APPROVE, (params) => {
      onlyKeys(params, new Set(['id', 'reason']))
      return approval.approve(params)
    })
    .register(methods.APPROVAL_REQUIRE_HUMAN, (params) => {
      onlyKeys(params, new Set(['id', 'reason']))
      return approval.requireHuman(params)
    })
}
