
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// --- INITIALIZATION ---
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// --- GEMINI SETUP ---
if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set in .env file. AI features will not work.");
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


// --- WEB APP API ROUTES ---

// Secure proxy endpoint for the web app to communicate with the Gemini API
app.post('/api/gemini', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API Key for Gemini is not configured on the server.' });
  }

  try {
    const { endpoint, payload } = req.body;

    let response;
    switch (endpoint) {
        case 'findMatches':
             const mockMatches = [
                { sport: 'Футбол', eventName: 'Лига Чемпионов', teams: 'Реал Мадрид vs. Бавария', date: new Date().toISOString().split('T')[0], time: '22:00', isHotMatch: true },
                { sport: 'Теннис', eventName: 'ATP Finals', teams: 'Синнер vs. Алькарас', date: new Date(Date.now() + 86400000).toISOString().split('T')[0], time: '18:00', isHotMatch: false },
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

// Mock endpoint for fetching bot users during local development
app.get('/api/admin/users', (req, res) => {
    console.log('[LOCAL DEV] Serving mock bot users for admin panel.');
    
    // This mocks the data that would be fetched from Cloudflare KV in production.
    const mockBotOnlyUsers = [
        {
            email: 'botuser1@telegram.bot',
            nickname: 'TelegramFan',
            password_hash: '', 
            registeredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            referralCode: 'BOTREF123',
            buttercups: 0,
            status: 'active',
            telegramId: 987654321,
            telegramUsername: 'telegramfan',
            source: 'telegram',
        },
        {
            email: 'botuser2@telegram.bot',
            nickname: 'SuperCapper',
            password_hash: '',
            registeredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            referralCode: 'CAPPERXYZ',
            buttercups: 0,
            status: 'active',
            telegramId: 123456789,
            telegramUsername: 'supercapper',
            source: 'telegram',
        }
    ];

    res.json({ users: mockBotOnlyUsers });
});


// --- TELEGRAM BOT LOCAL DEV ROUTES ---
// This temporary store is for local development only. In production, Cloudflare KV is used.
const tempAuthCodes = new Map();

app.post('/api/telegram/generate-code', (req, res) => {
    const { email, userData } = req.body;
    if (!email || !userData) {
        return res.status(400).json({ error: 'Email and userData are required.' });
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store with an expiry
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes
    tempAuthCodes.set(code, { userData, expiry });
    
    // Cleanup expired codes periodically (simple approach)
    setTimeout(() => {
        for (const [key, value] of tempAuthCodes.entries()) {
            if (Date.now() > value.expiry) {
                tempAuthCodes.delete(key);
            }
        }
    }, 6 * 60 * 1000);

    console.log(`[LOCAL DEV] Generated Telegram code ${code} for ${email}`);
    res.json({ code });
});


// --- START EXPRESS SERVER ---
app.listen(port, () => {
  console.log(`API server for local development listening at http://localhost:${port}`);
  console.log("This server provides API proxying for the web app.");
});