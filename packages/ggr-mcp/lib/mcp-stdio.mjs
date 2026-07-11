const JSON_RPC_VERSION = '2.0'

const ERROR_CODE = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
}

function rpcError (id, code, message) {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id: id ?? null,
    error: { code, message },
  }
}

function rpcResult (id, result) {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    result,
  }
}

function asToolContent (value) {
  if (value && Array.isArray(value.content)) {
    return value
  }

  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2),
      },
    ],
  }
}

function asToolError (error) {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  }
}

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateSchema (value, schema = {}, path = 'arguments') {
  if (Array.isArray(schema.enum) && !schema.enum.some(item => Object.is(item, value))) {
    return `${path} must be one of: ${schema.enum.join(', ')}`
  }

  switch (schema.type) {
    case 'object': {
      if (!isPlainObject(value)) {
        return `${path} must be an object`
      }
      for (const requiredKey of schema.required ?? []) {
        if (!Object.hasOwn(value, requiredKey)) {
          return `${path}.${requiredKey} is required`
        }
      }
      if (schema.additionalProperties === false) {
        const supportedKeys = new Set(Object.keys(schema.properties ?? {}))
        const extraKey = Object.keys(value).find(key => !supportedKeys.has(key))
        if (extraKey) {
          return `${path}.${extraKey} is not supported`
        }
      }
      for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
        if (!Object.hasOwn(value, key)) {
          continue
        }
        const error = validateSchema(value[key], propertySchema, `${path}.${key}`)
        if (error) {
          return error
        }
      }
      return null
    }
    case 'array': {
      if (!Array.isArray(value)) {
        return `${path} must be an array`
      }
      if (schema.items) {
        for (let index = 0; index < value.length; index++) {
          const error = validateSchema(value[index], schema.items, `${path}[${index}]`)
          if (error) {
            return error
          }
        }
      }
      return null
    }
    case 'string':
    case 'boolean':
    case 'number':
      return typeof value === schema.type ? null : `${path} must be a ${schema.type}`
    case 'integer':
      return Number.isInteger(value) ? null : `${path} must be an integer`
    default:
      return null
  }
}

export function createMcpServer ({ name, version, tools }) {
  const toolMap = new Map(tools.map(tool => [tool.name, tool]))
  let inputBuffer = Buffer.alloc(0)

  function writeMessage (message, output = process.stdout) {
    const body = JSON.stringify(message)
    output.write(`${body}\n`)
  }

  async function handleRequest (message) {
    if (!message || message.jsonrpc !== JSON_RPC_VERSION) {
      return rpcError(message?.id, ERROR_CODE.INVALID_REQUEST, 'Invalid JSON-RPC request')
    }

    const { id, method, params } = message

    if (!id && method?.startsWith('notifications/')) {
      return null
    }

    if (method === 'initialize') {
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name, version },
      })
    }

    if (method === 'tools/list') {
      return rpcResult(id, {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      })
    }

    if (method === 'tools/call') {
      const tool = toolMap.get(params?.name)
      if (!tool) {
        return rpcError(id, ERROR_CODE.METHOD_NOT_FOUND, `Unknown tool: ${params?.name}`)
      }

      try {
        const args = params?.arguments ?? {}
        const validationError = validateSchema(args, tool.inputSchema)
        if (validationError) {
          return rpcResult(id, asToolError(new Error(`Invalid tool arguments: ${validationError}`)))
        }
        return rpcResult(id, asToolContent(await tool.handler(args)))
      } catch (error) {
        return rpcResult(id, asToolError(error))
      }
    }

    if (method === 'resources/list') {
      return rpcResult(id, { resources: [] })
    }

    if (method === 'prompts/list') {
      return rpcResult(id, { prompts: [] })
    }

    return rpcError(id, ERROR_CODE.METHOD_NOT_FOUND, `Unknown method: ${method}`)
  }

  async function handlePayload (payload, output) {
    try {
      const response = await handleRequest(JSON.parse(payload))
      if (response) {
        writeMessage(response, output)
      }
    } catch {
      writeMessage(rpcError(null, ERROR_CODE.PARSE_ERROR, 'Failed to parse JSON payload'), output)
    }
  }

  function drainBuffer (output) {
    while (inputBuffer.length) {
      const lineEnd = inputBuffer.indexOf('\n')
      if (lineEnd < 0) {
        return
      }

      const payload = inputBuffer.subarray(0, lineEnd).toString('utf8').trim()
      inputBuffer = inputBuffer.subarray(lineEnd + 1)
      if (!payload) {
        continue
      }
      void handlePayload(payload, output)
    }
  }

  function start ({ input = process.stdin, output = process.stdout } = {}) {
    input.on('data', chunk => {
      inputBuffer = Buffer.concat([inputBuffer, Buffer.from(chunk)])
      drainBuffer(output)
    })
  }

  return { start }
}
