require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenAI, Type } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// --- INITIALIZATION ---
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// --- GEMINI SETUP ---
if (!process.env.API_KEY) {
    console.error("API_KEY is not set in .env file. AI features will not work.");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


// --- DATA STORAGE HELPERS ---
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const readJsonFile = (filename) => {
  const filePath = path.join(dataDir, filename);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error(`Error reading or parsing ${filename}:`, e);
      return {};
    }
  }
  return {};
};

const writeJsonFile = (filename, data) => {
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};


// --- WEB APP API ROUTES ---

// Endpoint for the web app to generate a temporary code for Telegram bot authentication
app.post('/api/telegram/generate-code', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }
    const authCodes = readJsonFile('telegram_auth_codes.json');
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

    authCodes[code] = { email, expiresAt };
    writeJsonFile('telegram_auth_codes.json', authCodes);

    console.log(`Generated code ${code} for user ${email}`);
    res.json({ code });
});

// Secure proxy endpoint for the web app to communicate with the Gemini API
app.post('/api/gemini', async (req, res) => {
  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'API Key for Gemini is not configured on the server.' });
  }

  try {
    const { endpoint, payload } = req.body;

    let response;
    // This proxy can be extended to handle different AI functionalities
    switch (endpoint) {
        case 'findMatches':
            // Complex logic for finding matches should be implemented here
            // For now, returning a mock response
             const mockMatches = [
                { sport: 'Футбол', eventName: 'Лига Чемпионов', teams: 'Реал Мадрид vs. Бавария', date: '2024-10-28', time: '22:00', isHotMatch: true },
                { sport: 'Теннис', eventName: 'ATP Finals', teams: 'Синнер vs. Алькарас', date: '2024-10-29', time: '18:00', isHotMatch: false },
             ];
            return res.json({ events: mockMatches });
        
        case 'generateContent':
        default:
            const result = await ai.models.generateContent(payload);
            response = { text: result.text, sources: result.candidates?.[0]?.groundingMetadata?.groundingChunks };
            break;
    }

    res.json(response);

  } catch (error) {
    console.error('Gemini API proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from Gemini API on the server.' });
  }
});


// NOTE: All Telegram Bot logic has been removed from this file.
// This server's sole purpose in the current setup is to act as a secure API gateway
// for the frontend application, especially for handling the Gemini API key.
// A separate process/file should be used for the Telegram bot if it needs to run concurrently.


// --- START EXPRESS SERVER ---
app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
  console.log("This server acts as a secure proxy for the frontend application.");
});
