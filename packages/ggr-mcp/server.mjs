import { createMcpServer } from './lib/mcp-stdio.mjs'
import { createAgentService } from './lib/agent-service.mjs'

const agentService = createAgentService()

const tools = [
  {
    name: 'boss_get_status',
    description: 'Return the current local controller status. This does not expose cookies or localStorage.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => agentService.getStatus(),
  },
  {
    name: 'boss_start_agent',
    description: 'Start the GeekGeekRun BOSS daemon as a local child process.',
    inputSchema: {
      type: 'object',
      properties: {
        headless: { type: 'boolean', default: true },
        mode: { type: 'string', enum: ['semi_auto', 'manual', 'auto'], default: 'semi_auto' },
        configPatch: {},
      },
      additionalProperties: false,
    },
    handler: args => agentService.start(args),
  },
  {
    name: 'boss_stop_agent',
    description: 'Stop the local GeekGeekRun BOSS daemon child process.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => agentService.stop(),
  },
  {
    name: 'boss_update_config',
    description: 'Update one supported GeekGeekRun config file under ~/.geekgeekrun/config.',
    inputSchema: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          enum: ['boss.json', 'common-job-condition-config.json', 'target-company-list.json', 'llm.json', 'dingtalk.json'],
        },
        patch: {},
      },
      required: ['fileName', 'patch'],
      additionalProperties: false,
    },
    handler: args => agentService.updateConfig(args),
  },
]

createMcpServer({
  name: '@geekgeekrun/ggr-mcp',
  version: '0.1.0',
  tools,
}).start()
