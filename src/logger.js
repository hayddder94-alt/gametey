'use strict';
/** سجلات منظمة (pinojs/pino + pino-http) إلى data/logs/app.log */
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const pinoHttp = require('pino-http');
const config = require('./config');

const logDir = path.join(config.root, 'data', 'logs');
fs.mkdirSync(logDir, { recursive: true });

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
}, pino.destination({ dest: path.join(logDir, 'app.log'), mkdir: true, sync: false }));

const httpLogger = pinoHttp({
  logger,
  customLogLevel: function (req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

module.exports = { logger, httpLogger };
