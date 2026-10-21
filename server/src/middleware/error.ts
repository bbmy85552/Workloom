import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/asyncHandler.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: '请求参数不合法',
      code: 'INVALID_PARAMS',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }
  console.error('[Workloom] 未捕获异常:', err);
  return res.status(500).json({
    error: '服务器内部错误',
    code: 'INTERNAL_ERROR',
  });
}
