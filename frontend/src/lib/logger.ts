import winston from 'winston';
import 'winston-daily-rotate-file';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info as any;
    const logObj: any = {
      timestamp,
      level,
      message,
      ...meta
    };
    
    if (stack) {
      logObj.stack = stack;
    }
    
    return JSON.stringify(logObj);
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'container-app',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf((info) => {
          const { timestamp, level, message, stack, ...meta } = info as any;
          let log = `${timestamp} [${level}] ${message}`;
          
          if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
          }
          
          if (stack) {
            log += `\n${stack}`;
          }
          
          return log;
        })
      )
    }),

    // File transport for all logs
    new winston.transports.DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info'
    }),

    // Separate file for errors
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error'
    })
  ],

  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d'
    })
  ],

  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
});

// Create logs directory if it doesn't exist
import fs from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Helper functions for structured logging
export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta);
};

export const logError = (message: string, error?: Error | any, meta?: any) => {
  const logMeta = { ...meta };
  
  if (error) {
    if (error instanceof Error) {
      logMeta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    } else {
      logMeta.error = error;
    }
  }
  
  logger.error(message, logMeta);
};

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta);
};

// Request logging middleware helper
export const logRequest = (method: string, url: string, userId?: string, meta?: any) => {
  logger.info('HTTP Request', {
    method,
    url,
    userId,
    type: 'request',
    ...meta
  });
};

export const logResponse = (method: string, url: string, statusCode: number, duration: number, userId?: string, meta?: any) => {
  logger.info('HTTP Response', {
    method,
    url,
    statusCode,
    duration,
    userId,
    type: 'response',
    ...meta
  });
};

// Container operation logging
export const logContainerOperation = (operation: string, containerId: string, userId: string, success: boolean, meta?: any) => {
  const level = success ? 'info' : 'error';
  logger.log(level, `Container operation: ${operation}`, {
    operation,
    containerId,
    userId,
    success,
    type: 'container',
    ...meta
  });
};

// Security event logging
export const logSecurityEvent = (event: string, userId?: string, ip?: string, userAgent?: string, meta?: any) => {
  logger.warn('Security event', {
    event,
    userId,
    ip,
    userAgent,
    type: 'security',
    ...meta
  });
};

// Audit logging
export const logAudit = (action: string, resource: string, userId: string, adminUserId?: string, meta?: any) => {
  logger.info('Audit event', {
    action,
    resource,
    userId,
    adminUserId,
    type: 'audit',
    ...meta
  });
};

export default logger; 