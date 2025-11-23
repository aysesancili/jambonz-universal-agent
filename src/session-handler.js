const { loadConfig } = require('./config-loader');
const { logger } = require('./utils/logger');
const GeminiClient = require('./llm/google');

module.exports = async function sessionHandler(session) {
  const { call_sid, direction, from, to } = session;

  // Oturum kapanış logları
  session.on('close', (code, reason) => logger.info({ call_sid, code, reason }, 'Session closed'));
  session.on('error', (err) => logger.error({ err, call_sid }, 'Session error'));

  logger.info({ call_sid, from, to, direction }, '📞 Handling new session');

  try {
    // 1. Config Yükle (Backend'den)
    const targetNumber = direction === 'inbound' ? to : from;
    const config = await loadConfig(targetNumber);

    if (!config) {
      logger.warn({ targetNumber }, '❌ No config found, reject call');
      session.say({ text: 'Yapılandırma hatası. Lütfen yönetici ile görüşün.' }).hangup().send();
      return;
    }

    // Milyon Dolarlık Log: Gelen konfigürasyonu görelim
    logger.info({ agentName: config.name, config }, '🔥 CONFIG RECEIVED FROM BACKEND');

    // 2. LLM Başlat
    const llmApiKey = process.env.GOOGLE_API_KEY; 
    const llmModel = config.llm?.model || 'gemini-2.0-flash-exp';
    const systemPrompt = config.llm?.systemPrompt || 'Sen yardımsever bir asistansın.';

    const llm = new GeminiClient(llmApiKey, llmModel);
    await llm.startChat(systemPrompt);

    // Ortak Konuşma Döngüsü (Recursion yerine Event Loop)
    const listenAndRespond = () => {
        session
            .gather({
                input: ['speech'],
                timeout: 5,
                recognizer: {
                    vendor: config.stt?.vendor || 'deepgram',
                    label: config.stt?.label || 'stt',
                    language: 'tr-TR',
                    interimResults: true,
                    punctuation: true
                },
                actionHook: '/onSpeech'
            })
            .send();
    };

    // 3. Konuşma Algılandığında (Action Hook)
    session.on('/onSpeech', async (evt) => {
        const speech = evt.speech?.alternatives?.[0]?.transcript;
        
        if (speech) {
            logger.info({ speech }, '🎤 User input');

            // LLM'e sor (Streaming yanıt eklenebilir, şimdilik bloklu)
            const aiResponse = await llm.sendMessage(speech);
            logger.info({ aiResponse }, '🤖 AI response');

            // Cevap ver
            session
                .say({
                    text: aiResponse,
                    synthesizer: {
                        vendor: config.tts?.vendor || 'elevenlabs',
                        label: config.tts?.label || 'tts',
                        language: 'tr-TR',
                        voice: config.tts?.voiceId || 'Rachel'
                    }
                })
                // Cevap bittiğinde tekrar dinle
                .gather({
                    input: ['speech'],
                    timeout: 5,
                    recognizer: {
                        vendor: config.stt?.vendor || 'deepgram',
                        label: config.stt?.label || 'stt',
                        language: 'tr-TR',
                        interimResults: true,
                        punctuation: true
                    },
                    actionHook: '/onSpeech'
                })
                .reply(); 
        } else {
            // Sessizlik durumunda tekrar dinle
            // logger.debug('No speech detected, listening again...');
            session.reply(); // Ack
            // Loop döngüsü
             session
                .gather({
                    input: ['speech'],
                    timeout: 5,
                    recognizer: {
                        vendor: config.stt?.vendor || 'deepgram',
                        label: config.stt?.label || 'stt',
                        language: 'tr-TR',
                        interimResults: true,
                        punctuation: true
                    },
                    actionHook: '/onSpeech'
                })
                .send();
        }
    });

    // 4. Başlat (Açılış Stratejisi)
    let greetingText = config.greeting; // Dashboard'dan gelirse kullan
    
    if (direction === 'inbound') {
        logger.info('Inbound call: Agent greeting first');

        // Eğer sabit mesaj yoksa, LLM'e ürettir (Dinamik Giriş)
        if (!greetingText) {
             logger.info('Generating dynamic greeting from LLM...');
             greetingText = await llm.sendMessage("Çağrı başladı. Rolüne uygun, kısa ve doğal bir açılış cümlesi söyle.");
        }

        session
            .answer()
            .pause({ length: 0.5 })
            .say({
                text: greetingText,
                synthesizer: {
                    vendor: config.tts?.vendor || 'elevenlabs',
                    label: config.tts?.label || 'tts',
                    language: 'tr-TR',
                    voice: config.tts?.voiceId || 'Rachel'
                }
            })
            .gather({
                input: ['speech'],
                timeout: 5,
                recognizer: {
                    vendor: config.stt?.vendor || 'deepgram',
                    label: config.stt?.label || 'stt',
                    language: 'tr-TR',
                    interimResults: true,
                    punctuation: true
                },
                actionHook: '/onSpeech'
            })
            .send();
    } else {
        // OUTBOUND: Önce dinle
        logger.info('Outbound call: Waiting for user');
        session
            .answer()
            .pause({ length: 0.5 })
            .gather({
                input: ['speech'],
                timeout: 5,
                recognizer: {
                    vendor: config.stt?.vendor || 'deepgram',
                    label: config.stt?.label || 'stt',
                    language: 'tr-TR',
                    interimResults: true,
                    punctuation: true
                },
                actionHook: '/onSpeech'
            })
            .send();
    }

  } catch (error) {
    logger.error({ err: error }, 'Handler Error');
    session.hangup().send();
  }
};
