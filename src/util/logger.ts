import pino from 'pino';
import { env } from '../config/index.js';

// Create logger instance
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Request ID middleware
export const addRequestId = (request: any, reply: any, done: any) => {
  const requestId = Math.random().toString(36).substring(2, 15);
  request.requestId = requestId;
  reply.header('X-Request-ID', requestId);
  done();
};

// Logging middleware
export const logRequest = (request: any, reply: any, done: any) => {
  const start = Date.now();
  
  request.log = logger.child({
    requestId: request.requestId,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  });

  reply.addHook('onSend', (request: any, reply: any, payload: any, done: any) => {
    const duration = Date.now() - start;
    
    request.log.info({
      statusCode: reply.statusCode,
      duration,
    }, 'Request completed');
    
    done();
  });

  done();
};
