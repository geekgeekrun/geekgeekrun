import { createRequest, type RpcRequest } from '@geekgeekrun/ggr-protocol'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T

interface StartTaskParams {
  workerId: string
}

const noParams = createRequest('r1', 'system.health')
type NoParamsRequestIsEmpty = Expect<
  Equal<typeof noParams, RpcRequest<Record<string, never>>>
>

const typedParams = createRequest<StartTaskParams>('r2', 'task.start', {
  workerId: 'geekAutoStartWithBossMain'
})
type TypedRequestKeepsPayload = Expect<
  Equal<typeof typedParams, RpcRequest<StartTaskParams>>
>

// @ts-expect-error A request with a required payload cannot omit params.
createRequest<StartTaskParams>('r3', 'task.start')
