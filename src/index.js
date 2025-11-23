require('dotenv').config();
const { createServer } = require('http');
const { createEndpoint } = require('@jambonz/node-client-ws');
const { logger } = require('./utils/logger');
const sessionHandler = require('./session-handler');

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
    return;
  }
  // Diğer istekler için 404, websocket upgrade'i kütüphane halleder
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  logger.info(`Universal Agent listening on port ${port}`);
});

// Jambonz Endpoint
const makeService = createEndpoint({ server });

// '/callControl' path'i için servis oluştur
const svc = makeService({ path: '/callControl' });

svc.on('session:new', (session) => {
  logger.info({ call_sid: session.call_sid }, 'New session received');

  session.on('close', (code, reason) => {
    logger.info({ code, reason, call_sid: session.call_sid }, 'Session closed');
  });

  session.on('error', (err) => {
    logger.error({ err, call_sid: session.call_sid }, 'Session error');
  });

  // Session Handler'ı çağır
  sessionHandler(session).catch((err) => {
    logger.error({ err, call_sid: session.call_sid }, 'Handler error');
    // Kütüphanenin close metodu olmayabilir, hangup ile bitirelim
    try { session.hangup().send(); } catch (e) {}
  });
});
