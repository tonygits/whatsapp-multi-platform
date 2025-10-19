import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

/**
 * Error handling middleware
 */
interface ErrorResponse {
  error: string;
  code: string;
  timestamp: string;
  path: string;
  method: string;
  details?: any;
  requestId?: string;
}

interface CustomErrorType extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  isCustomError?: boolean;
}

const errorHandler = (err: CustomErrorType, req: Request, res: Response, next: NextFunction) => {
  // Log the error
  logger.error('Application error:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Default error response
  let status = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';
  let details: string | null = null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Invalid input data';
    code = 'VALIDATION_ERROR';
    details = err.details || err.message;
  } else if (err.name === 'UnauthorizedError' || err.message.includes('unauthorized')) {
    status = 401;
    message = 'Unauthorized';
    code = 'UNAUTHORIZED';
  } else if (err.name === 'ForbiddenError' || err.message.includes('forbidden')) {
    status = 403;
    message = 'Access prohibited';
    code = 'FORBIDDEN';
  } else if (err.name === 'NotFoundError' || err.message.includes('not found')) {
    status = 404;
    message = 'Resource not found';
    code = 'NOT_FOUND';
  } else if (err.name === 'ConflictError' || err.message.includes('already exists')) {
    status = 409;
    message = 'Conflict - resource already exists';
    code = 'CONFLICT';
  } else if (err.name === 'TimeoutError') {
    status = 408;
    message = 'Operation timeout';
    code = 'TIMEOUT';
  } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    status = 503;
    message = 'Service unavailable';
    code = 'SERVICE_UNAVAILABLE';
  } else if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
    status = 400;
    message = 'Invalid JSON';
    code = 'INVALID_JSON';
  }

  // Custom application errors
  if (err.isCustomError) {
    status = err.statusCode || 400;
    message = err.message;
    code = err.code || 'CUSTOM_ERROR';
    details = err.details;
  }

  // Rate limit errors
  if (err.message && err.message.includes('rate limit')) {
    status = 429;
    message = 'Many requests';
    code = 'RATE_LIMIT_EXCEEDED';
  }

  // Docker errors
  if (err.message && err.message.includes('docker')) {
    status = 503;
    message = 'Docker service error';
    code = 'DOCKER_ERROR';
    details = process.env.NODE_ENV === 'development' ? err.message : null;
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && status === 500) {
    message = 'Internal server error';
    details = null;
  }

  // Prepare error response
  const errorResponse: ErrorResponse = {
    error: message,
    code,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  // Add details if available
  if (details) {
    errorResponse.details = details;
  }

  // Add request ID if available
  if ((req as any).id) {
    errorResponse.requestId = (req as any).id;
  }

  // Send error response
  res.status(status).json(errorResponse);
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req: Request, res: Response) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Endpoint not found',
    code: 'ENDPOINT_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      auth: '/api/auth',
      devices: '/api/devices',
      messages: '/api/messages',
      health: '/api/health'
    }
  });
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Custom error class for application-specific errors
 */
class CustomError extends Error {
  statusCode: number;
  code: string;
  details: any;
  isCustomError: boolean;
  constructor(message: string, statusCode: number = 400, code: string = 'CUSTOM_ERROR', details: any = null) {
    super(message);
    this.name = 'CustomError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isCustomError = true;
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomError);
    }
  }
}

/**
 * Request timeout middleware
 */
const timeoutMiddleware = (timeout: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setTimeout(timeout, () => {
      const err = new CustomError(
        'Request expired',
        408,
        'REQUEST_TIMEOUT'
      );
      next(err);
    });
    next();
  };
};

/**
 * Request logging middleware
 */
const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Generate request ID
  (req as any).id = Math.random().toString(36).substr(2, 9);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]('Request processed', {
  requestId: (req as any).id,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: res.get('Content-Length') || 0
    });
  });

  next();
};

/**
 * Global error handlers for uncaught exceptions
 */
const setupGlobalErrorHandlers = (): void => {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
};

export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  CustomError,
  timeoutMiddleware,
  requestLogger,
  setupGlobalErrorHandlers
};
