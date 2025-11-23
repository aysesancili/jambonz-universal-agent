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
      logger.warn({ targetNumber }, 'No config found, reject call');
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

    // 3. Konuşma Döngüsü
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
                actionHook: '/onSpeech' // Bu path'i dinleyeceğiz
            })
            .send();
    };

    // 4. Konuşma Algılandığında (Action Hook)
    session.on('/onSpeech', async (evt) => {
        // Konuşma var mı?
        if (evt.speech && evt.speech.alternatives && evt.speech.alternatives.length > 0) {
            const userText = evt.speech.alternatives[0].transcript;
            logger.info({ userText }, 'User input');

            // LLM'e sor
            const aiResponse = await llm.sendMessage(userText);
            logger.info({ aiResponse }, 'AI response');

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
                // Cevap okunduktan sonra ('exec' event'i komut bitince tetiklenir mi? 
                // Jambonz node client'ta 'verb:hook' mantığı vardır. 
                // En garantisi iç içe göndermek ama zincirleme yapıda 'exec' veya callback kullanabiliriz.
                // Ancak node-client-ws kütüphanesinde .send() asenkrondur.
                // Basitçe yeni bir gather gönderelim.
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
            // Sessizlik veya timeout -> Tekrar dinle
            logger.info('No speech detected or timeout');
            listenAndRespond();
        }
    });

    // 5. Açılış
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
            // Konuşma bitince dinlemeye geçmesi için gather'ı zincirliyoruz
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
        // OUTBOUND: Önce dinle (Müşteri "Alo" desin)
        logger.info('Outbound call: Waiting for user to speak');
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
    logger.error({ err: error }, 'Error in session handler');
    session.hangup().send();
  }
};
