import { Router, type Request, type Response } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticateApiKeyValue, extractApiKeyFromRequest } from '../middleware/apiKeyAuth.js';
import type { AuthedUser } from '../middleware/auth.js';
import { createDocsPlatformMcpServer } from '../mcp/server.js';
import { createMemoryMcpServer } from '../mcp/memoryTools.js';
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

/** 无状态 Streamable HTTP：每个请求按 API Key 解析用户，新建一个 McpServer 处理后关闭。 */
function statelessMcpHandler(factory: (user: AuthedUser) => McpServer) {
  return async (req: Request, res: Response) => {
    let server: McpServer | undefined;
    let transport: StreamableHTTPServerTransport | undefined;
    try {
      const user = await authenticateApiKeyValue(extractApiKeyFromRequest(req));
      server = factory(user);
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
  };
}

function methodNotAllowed(message: string) {
  return (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json({
      jsonrpc: '2.0',
      error: { code: -32000, message },
      id: null,
    });
  };
}

const GET_MESSAGE = 'Method not allowed. Use POST for Streamable HTTP MCP.';
const DELETE_MESSAGE = 'Method not allowed. Stateless MCP sessions are not persisted.';

// 仅项目记忆工具：/mcp/memory（需在 '/' 之外单独声明，路径互不冲突）
mcpRouter.post('/memory', statelessMcpHandler(createMemoryMcpServer));
mcpRouter.get('/memory', methodNotAllowed(GET_MESSAGE));
mcpRouter.delete('/memory', methodNotAllowed(DELETE_MESSAGE));

// 全量工具（文档 + 数据表 + 项目记忆）：/mcp
mcpRouter.post('/', statelessMcpHandler(createDocsPlatformMcpServer));
mcpRouter.get('/', methodNotAllowed(GET_MESSAGE));
mcpRouter.delete('/', methodNotAllowed(DELETE_MESSAGE));
