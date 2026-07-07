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

function getContentLength (header) {
  const match = header.match(/content-length:\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

export function createMcpServer ({ name, version, tools }) {
  const toolMap = new Map(tools.map(tool => [tool.name, tool]))
  let inputBuffer = Buffer.alloc(0)

  function writeMessage (message, output = process.stdout) {
    const body = JSON.stringify(message)
    output.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
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
        return rpcResult(id, asToolContent(await tool.handler(params?.arguments ?? {})))
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
      const headerEnd = inputBuffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) {
        return
      }

      const header = inputBuffer.subarray(0, headerEnd).toString('utf8')
      const contentLength = getContentLength(header)
      if (!Number.isInteger(contentLength) || contentLength < 0) {
        writeMessage(rpcError(null, ERROR_CODE.INVALID_REQUEST, 'Missing or invalid Content-Length header'), output)
        inputBuffer = Buffer.alloc(0)
        return
      }

      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + contentLength
      if (inputBuffer.length < bodyEnd) {
        return
      }

      const payload = inputBuffer.subarray(bodyStart, bodyEnd).toString('utf8')
      inputBuffer = inputBuffer.subarray(bodyEnd)
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
