import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  approveAutoReply,
  createLocalProcessController,
  readAppData,
  readApprovalQueue,
  requireHumanIntervention,
  updateAppData
} from '../../ggr-controller/index.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function defaultRepoRoot() {
  return path.resolve(__dirname, '../../..')
}

export function createAgentService({ repoRoot = defaultRepoRoot(), approvalQueueFilePath, configDir } = {}) {
  const localController = createLocalProcessController({ repoRoot })

  return {
    ...localController,
    readAppData({ resource }) {
      return readAppData({ resource, configDir })
    },
    updateAppData({ resource, patch }) {
      return updateAppData({ resource, patch, configDir })
    },
    listAiReplyApprovals({ includeAll = false } = {}) {
      return readApprovalQueue({ includeAll, queueFilePath: approvalQueueFilePath })
    },
    approveAutoReply({ id }) {
      return approveAutoReply({ id, queueFilePath: approvalQueueFilePath })
    },
    requireHumanIntervention({ id, reason = 'manual handling required' }) {
      return requireHumanIntervention({ id, reason, queueFilePath: approvalQueueFilePath })
    }
  }
}
