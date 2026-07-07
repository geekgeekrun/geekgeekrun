import { createMcpServer } from './lib/mcp-stdio.mjs'

const state = {
  running: false,
  pid: null,
  mode: 'semi_auto',
  headless: true,
  lastError: null,
}

const tools = [
  {
    name: 'boss_get_status',
    description: 'Return the current local controller status. This V0 scaffold does not expose cookies or localStorage.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => state,
  },
  {
    name: 'boss_start_agent',
    description: 'Record a requested start. Process launch is intentionally left for the local service implementation.',
    inputSchema: {
      type: 'object',
      properties: {
        headless: { type: 'boolean', default: true },
        mode: { type: 'string', enum: ['semi_auto', 'manual', 'auto'], default: 'semi_auto' },
      },
      additionalProperties: false,
    },
    handler: args => {
      state.running = false
      state.headless = args.headless ?? true
      state.mode = args.mode ?? 'semi_auto'
      state.lastError = 'Process lifecycle service is not wired yet.'
      return state
    },
  },
  {
    name: 'boss_stop_agent',
    description: 'Record a requested stop. Process launch is intentionally left for the local service implementation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => {
      state.running = false
      return state
    },
  },
]

createMcpServer({
  name: '@geekgeekrun/ggr-mcp',
  version: '0.1.0',
  tools,
}).start()
