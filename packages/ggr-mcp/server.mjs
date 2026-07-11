import { createMcpServer } from './lib/mcp-stdio.mjs'
import { createAgentService } from './lib/agent-service.mjs'

const agentService = createAgentService()
const appDataResources = [
  'job_intention',
  'opening_message',
  'reply_policy',
  'target_companies',
  'blacklist_companies',
  'llm_config',
  'notification_config',
  'runtime_status'
]
const writableAppDataResources = appDataResources.filter((resource) => resource !== 'runtime_status')

const tools = [
  {
    name: 'boss_get_status',
    description: 'Return the current local controller status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => agentService.getStatus()
  },
  {
    name: 'boss_start_agent',
    description: 'Start the automatic GeekGeekRun BOSS chat agent as a local child process.',
    inputSchema: {
      type: 'object',
      properties: {
        headless: { type: 'boolean', default: true },
        mode: { type: 'string', enum: ['auto'], default: 'auto' },
        configPatch: {}
      },
      additionalProperties: false
    },
    handler: args => agentService.start(args)
  },
  {
    name: 'boss_stop_agent',
    description: 'Stop the local GeekGeekRun BOSS daemon child process.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => agentService.stop()
  },
  {
    name: 'boss_update_config',
    description: 'Update one supported GeekGeekRun config file.',
    inputSchema: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          enum: ['boss.json', 'common-job-condition-config.json', 'target-company-list.json', 'llm.json', 'dingtalk.json']
        },
        patch: {}
      },
      required: ['fileName', 'patch'],
      additionalProperties: false
    },
    handler: args => agentService.updateConfig(args)
  },
  {
    name: 'boss_read_app_data',
    description: 'Read one whitelisted user-level GeekGeekRun app-data resource.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: { type: 'string', enum: appDataResources }
      },
      required: ['resource'],
      additionalProperties: false
    },
    handler: args => agentService.readAppData(args)
  },
  {
    name: 'boss_update_app_data',
    description: 'Update one whitelisted user-level GeekGeekRun app-data resource.',
    inputSchema: {
      type: 'object',
      properties: {
        resource: { type: 'string', enum: writableAppDataResources },
        patch: {}
      },
      required: ['resource', 'patch'],
      additionalProperties: false
    },
    handler: args => agentService.updateAppData(args)
  },
  {
    name: 'boss_list_ai_reply_approvals',
    description: 'List AI auto-reply approval requests. By default returns only pending requests.',
    inputSchema: {
      type: 'object',
      properties: {
        includeAll: { type: 'boolean', default: false }
      },
      additionalProperties: false
    },
    handler: args => agentService.listAiReplyApprovals(args)
  },
  {
    name: 'boss_approve_auto_reply',
    description: 'Allow one pending AI draft reply to be sent by the worker after context checks. This does not send directly.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id'],
      additionalProperties: false
    },
    handler: args => agentService.approveAutoReply(args)
  },
  {
    name: 'boss_require_human_intervention',
    description: 'Mark one AI draft reply as requiring manual handling. The worker will not send it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['id'],
      additionalProperties: false
    },
    handler: args => agentService.requireHumanIntervention(args)
  }
]

createMcpServer({
  name: '@geekgeekrun/ggr-mcp',
  version: '0.1.0',
  tools
}).start()
