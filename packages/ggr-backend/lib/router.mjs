const handlers = new Map()

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
