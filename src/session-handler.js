const { loadConfig } = require('./config-loader');
const { logger } = require('./utils/logger');
const GeminiClient = require('./llm/google');

module.exports = async function sessionHandler(session) {
  const { call_sid, direction, from, to } = session;
  logger.info({ call_sid, from, to, direction }, 'Handling new session');

  try {
    // 1. Config Yükle
    const targetNumber = direction === 'inbound' ? to : from;
    const config = await loadConfig(targetNumber);

    if (!config) {
      logger.warn({ targetNumber }, 'No config found');
      session.say({ text: 'Yapılandırma hatası.' }).hangup().send();
      return;
    }

    logger.info({ agentName: config.name }, 'Agent config loaded');

    // 2. LLM Başlat
    const llmApiKey = process.env.GOOGLE_API_KEY;
    const llmModel = config.llm?.model || 'gemini-2.0-flash-exp';
    const systemPrompt = config.llm?.systemPrompt || 'Sen yardımsever bir asistansın.';
    
    const llm = new GeminiClient(llmApiKey, llmModel);
    await llm.startChat(systemPrompt);

    // 3. Konuşma Algılandığında (Action Hook)
    session.on('/onSpeech', async (evt) => {
        const speech = evt.speech?.alternatives?.[0]?.transcript;
        
        if (speech) {
            logger.info({ speech }, 'User input');

            // LLM'e sor
            const aiResponse = await llm.sendMessage(speech);
            logger.info({ aiResponse }, 'AI response');

            // Cevap ver ve tekrar dinle (Zincirleme)
            // reply() kullanarak hook'a yanıt veriyoruz, gecikmeyi önlüyoruz.
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
                .reply(); // Bu çok önemli! Hook'a cevap.
        } else {
            logger.info('No speech detected or timeout');
            // Sessizlik durumunda tekrar dinle
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
                .reply();
        }
    });

    // 4. Başlat (Açılış)
    const greetingText = config.greeting || "Merhaba, size nasıl yardımcı olabilirim?";

    if (direction === 'inbound') {
        logger.info('Inbound call: Agent greeting first');
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
        // Outbound: Önce dinle
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
