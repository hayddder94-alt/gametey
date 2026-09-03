'use strict';
/** قناة لحظية (socket.io) للوحة الإدارة — مصادقة عبر كوكي الجلسة نفسها */
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./config');

let io = null;

function attach(httpServer) {
  io = new Server(httpServer, { transports: ['websocket', 'polling'] });
  io.use((socket, next) => {
    try {
      const header = socket.handshake.headers.cookie || '';
      const m = header.match(new RegExp(config.cookieName + '=([^;]+)'));
      if (!m) return next(new Error('unauthorized'));
      const payload = jwt.verify(decodeURIComponent(m[1]), config.jwtSecret);
      if (payload.typ !== 'admin') return next(new Error('unauthorized'));
      socket.data.admin = payload;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (s) => s.join('admins'));
  return io;
}

/** بث حدث لغرفة المديرين فقط */
function emitAdmin(event, data) {
  if (io) io.to('admins').emit(event, data);
}

module.exports = { attach, emitAdmin };
