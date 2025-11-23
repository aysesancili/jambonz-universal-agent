require('dotenv').config();
const { WebSocketServer } = require('ws');
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

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/callControl') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  logger.info('New WebSocket connection');

  const session = {
    call_sid: null,
    direction: null,
    from: null,
    to: null,
    ws: ws,
    handlers: {},
    
    on: function(event, handler) {
        this.handlers[event] = handler;
        return this;
    },

    send: function(cmd) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(cmd));
        }
        return this;
    },

    answer: function() { return this; },
    say: function(opts) { 
        this.send({ type: 'command', command: 'say', data: opts }); 
        return this; 
    },
    gather: function(opts) { 
        this.send({ type: 'command', command: 'gather', data: opts }); 
        return this; 
    },
    pause: function(opts) { 
        this.send({ type: 'command', command: 'pause', data: opts }); 
        return this; 
    },
    hangup: function() { 
        this.send({ type: 'command', command: 'hangup' }); 
        return this; 
    },
    close: function() { ws.close(); }
  };

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      // ACK Gönder
      if (msg.msgid) {
        ws.send(JSON.stringify({
            type: 'ack',
            msgid: msg.msgid
        }));
      }

      if (msg.type === 'session:new') {
        session.call_sid = msg.data.call_sid;
        session.direction = msg.data.direction;
        session.from = msg.data.from;
        session.to = msg.data.to;
        
        logger.info({ call_sid: session.call_sid }, 'Session New');
        sessionHandler(session);
      } 
      else if (msg.type === 'verb:hook') {
        // Hook ismini al (örn: /onSpeech)
        // Jambonz hook'u tam URL olarak gönderebilir veya sadece path.
        // Biz includes ile kontrol edelim.
        const hookUrl = msg.data.hook;
        
        for (const [event, handler] of Object.entries(session.handlers)) {
            if (hookUrl && hookUrl.includes(event)) {
                handler(msg.data);
            }
        }
      }
      else if (msg.type === 'session:end') {
          logger.info('Session End');
      }

    } catch (err) {
      logger.error({ err }, 'WebSocket Message Error');
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Universal Agent listening on port ${PORT}`);
});
