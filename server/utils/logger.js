const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

winston.addColors(logColors);

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0 && meta.stack) {
      msg += `\n${meta.stack}`;
    } else if (Object.keys(meta).length > 0) {
      const metaStr = JSON.stringify(meta, null, 2);
      if (metaStr !== '{}') {
        msg += ` ${metaStr}`;
      }
    }
    return msg;
  })
);

const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || (isTest ? 'error' : (isDevelopment ? 'debug' : 'info')),
  format: logFormat,
  transports: []
});

if (isDevelopment || isTest) {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    silent: isTest && process.env.LOG_LEVEL !== 'debug'
  }));
} else {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.json()
    ),
    level: 'info'
  }));

  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    maxsize: 5242880,
    maxFiles: 10,
    tailable: true
  }));

  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    maxsize: 5242880,
    maxFiles: 10,
    tailable: true
  }));
}

logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

module.exports = logger;
