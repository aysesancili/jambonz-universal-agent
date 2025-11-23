require('dotenv').config();
const { createEndpoint } = require('@jambonz/node-client-ws');
const { createServer } = require('http');
const { logger } = require('./utils/logger');
const sessionHandler = require('./session-handler');

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
    return;
  }
  res.writeHead(404);
  res.end();
});

// Jambonz Resmi Kütüphanesi ile Endpoint
const makeService = createEndpoint({
  server,
  path: '/callControl'
});

// Yeni çağrı geldiğinde
makeService.on('session:new', (session) => {
  logger.info({ call_sid: session.call_sid }, 'New session received');
  
  // Hata yönetimi
  session.on('close', (code, reason) => {
    logger.info({ code, reason, call_sid: session.call_sid }, 'Session closed');
  });
  
  session.on('error', (err) => {
    logger.error({ err, call_sid: session.call_sid }, 'Session error');
  });

  sessionHandler(session).catch((err) => {
    logger.error({ err, call_sid: session.call_sid }, 'Session handler error');
    session.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Universal Agent listening on port ${PORT}`);
});
