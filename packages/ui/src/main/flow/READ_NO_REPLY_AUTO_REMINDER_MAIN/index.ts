// Temporary Electron compatibility entry. The production implementation is backend-owned.
import { runReadNoReplyEntry } from '../../../../../ggr-backend/lib/workers/read-no-reply.mjs'
import { createReadNoReplyRuntime } from '../../../../../ggr-backend/lib/workers/read-no-reply/runtime.mjs'

export { runReadNoReplyEntry, createReadNoReplyRuntime }

export async function runEntry() {
  return runReadNoReplyEntry({ createRuntime: createReadNoReplyRuntime })
}
