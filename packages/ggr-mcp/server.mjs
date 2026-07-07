import { createAgentService } from './lib/agent-service.mjs'
import { createMcpServer } from './lib/mcp-stdio.mjs'

const service = createAgentService()

const tools = [
  {
    name: 'boss_start_agent',
    description: 'Start the local GeekGeekRun daemon for BOSS automation. V0 controls process lifecycle only and does not send chat messages.',
    inputSchema: {
      type: 'object',
      properties: {
        headless: {
          type: 'boolean',
          description: 'Run Chromium without a visible window after the local headless patch is applied.',
          default: true,
        },
        mode: {
          type: 'string',
          enum: ['semi_auto', 'manual', 'auto'],
          description: 'Execution mode label for the controller. V0 records it for status; message sending is not implemented.',
          default: 'semi_auto',
        },
        configPatch: {
          type: 'object',
          description: 'Optional config patch. Use either { fileName, patch } or { "boss.json": { ... } }.',
        },
      },
      additionalProperties: false,
    },
    handler: async args => service.start(args),
  },
  {
    name: 'boss_stop_agent',
    description: 'Stop the local GeekGeekRun daemon if it is running.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async () => service.stop(),
  },
  {
    name: 'boss_get_status',
    description: 'Return the local GeekGeekRun daemon status without exposing cookies or localStorage.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: () => service.getStatus(),
  },
  {
    name: 'boss_update_config',
    description: 'Patch a safe GeekGeekRun config file under ~/.geekgeekrun/config.',
    inputSchema: {
      type: 'object',
      required: ['fileName', 'patch'],
      properties: {
        fileName: {
          type: 'string',
          enum: [
            'boss.json',
            'common-job-condition-config.json',
            'target-company-list.json',
            'llm.json',
            'dingtalk.json',
          ],
        },
        patch: {
          description: 'Object patch for object config files; array replacement for target-company-list.json.',
        },
      },
      additionalProperties: false,
    },
    handler: async args => service.updateConfig(args),
  },
]

createMcpServer({
  name: '@geekgeekrun/ggr-mcp',
  version: '0.1.0',
  tools,
}).start()
