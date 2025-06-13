import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string | undefined;
  details?: any;
}

export class HttpError extends Error implements AppError {
  public statusCode: number;
  public code: string | undefined;
  public details?: any;

  constructor(statusCode: number, message: string, code?: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'HttpError';
  }
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  const code = error.code || 'INTERNAL_ERROR';

  // Log error for debugging
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, {
    statusCode,
    message,
    code,
    details: error.details,
    stack: process.env['NODE_ENV'] === 'development' ? error.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      // Always include details for validation errors, or in development mode
      details: (code === 'VALIDATION_ERROR' || process.env['NODE_ENV'] === 'development') ? error.details : undefined,
    },
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}; 