const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logger } = require('../utils/logger');

class GeminiClient {
  constructor(apiKey, modelName) {
    if (!apiKey) {
        logger.error("Gemini API Key is missing!");
        throw new Error("Gemini API Key is required");
    }
    if (!modelName) {
        logger.error("Model Name is missing!");
        throw new Error("Model Name is required");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: modelName });
    this.chat = null;
  }

  async startChat(systemPrompt) {
    // System instruction (v1beta supports systemInstruction but chat history hack is safer for compatibility)
    this.chat = this.model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: `SYSTEM INSTRUCTION: ${systemPrompt}\n\nKısa, doğal ve konuşma diline uygun cevaplar ver. Merhaba deme, direkt konuya gir.` }],
        },
        {
          role: "model",
          parts: [{ text: "Anlaşıldı." }],
        },
      ],
    });
  }

  async sendMessage(text) {
    try {
      const result = await this.chat.sendMessage(text);
      const response = result.response.text();
      return response;
    } catch (error) {
      logger.error({ err: error }, 'Gemini API Error');
      return "Bir saniye, sizi duyamadım.";
    }
  }
}

module.exports = GeminiClient;

