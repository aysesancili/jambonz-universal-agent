const axios = require('axios');
const { logger } = require('./utils/logger');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const API_KEY = process.env.BACKEND_API_KEY; // qfix_prod_sk_...

/**
 * Backend'den Agent Config çeker
 * @param {string} phoneNumber - Arayan veya aranan numara
 */
async function loadConfig(phoneNumber) {
  try {
    logger.debug(`Fetching config for ${phoneNumber} from ${BACKEND_URL}`);

    const response = await axios.post(
      `${BACKEND_URL}/jambonz/config`,
      { number: phoneNumber },
      {
        headers: { 'Authorization': `Bearer ${API_KEY}` },
        timeout: 2000 // 2 saniye timeout (Hızlı olmalı)
      }
    );

    return response.data;
  } catch (error) {
    logger.error({ err: error.message }, `Failed to load config for ${phoneNumber}`);
    // Fallback config dönebiliriz veya null dönüp çağrıyı reddederiz
    return null;
  }
}

module.exports = { loadConfig };

