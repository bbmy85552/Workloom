import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticateApiKeyValue, extractApiKeyFromRequest } from '../middleware/apiKeyAuth.js';
import { createDocsPlatformMcpServer } from '../mcp/server.js';
import { HttpError } from '../lib/asyncHandler.js';

export const mcpRouter = Router();

function httpStatusForError(err: unknown) {
  if (err instanceof HttpError) return err.status;
  return 500;
}

function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return 'Internal server error';
}

mcpRouter.post('/', async (req, res) => {
  let server: ReturnType<typeof createDocsPlatformMcpServer> | undefined;
  let transport: StreamableHTTPServerTransport | undefined;
  try {
    const user = await authenticateApiKeyValue(extractApiKeyFromRequest(req));
    server = createDocsPlatformMcpServer(user);
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(httpStatusForError(err)).json({
        jsonrpc: '2.0',
        error: {
          code: err instanceof HttpError ? -32001 : -32603,
          message: errorMessage(err),
        },
        id: null,
      });
    }
  } finally {
    await transport?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  }
});

mcpRouter.get('/', (_req, res) => {
  res.status(405).set('Allow', 'POST').json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST for Streamable HTTP MCP.' },
    id: null,
  });
});

mcpRouter.delete('/', (_req, res) => {
  res.status(405).set('Allow', 'POST').json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Stateless MCP sessions are not persisted.' },
    id: null,
  });
});
