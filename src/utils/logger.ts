
import winston from 'winston';
import path from 'path';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? '\n' + stack : ''}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
  format: logFormat,
  defaultMeta: { service: 'whatsapp-gateway' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(process.env.LOGS_PATH || './logs', 'app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // File transport for error logs only
    new winston.transports.File({
      filename: path.join(process.env.LOGS_PATH || './logs', 'error.log'),
  level: 'error',
  maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
  ],
});

export default logger;
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(process.env.LOGS_PATH || './logs', 'exceptions.log')
  })
);

// Handle unhandled promise rejections
process.on('unhandledRejection', (ex) => {
  logger.error('Unhandled Promise Rejection:', ex);
});

module.exports = logger;