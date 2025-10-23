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


// Mock endpoint for fetching matches WITH AI predictions for local dev
app.get('/api/matches-with-predictions', (req, res) => {
    const sport = req.query.sport;
    console.log(`[LOCAL DEV] Serving mock matches with predictions for sport: ${sport}`);
    
    let mockMatches = [];
    let mockPredictions = [];

    if (sport === 'football') {
        mockMatches = [
            { sport: sport, eventName: 'Mock League', teams: 'Команда А vs. Команда Б', date: '2024-07-28', time: '18:00', isHotMatch: true, status: { long: 'Not Started', short: 'NS', emoji: '⏳' } },
            { sport: sport, eventName: 'Mock Finals', teams: 'Команда X vs. Команда Y', date: '2024-07-28', time: '16:00', isHotMatch: false, status: { long: 'Finished', short: 'FT', emoji: '🏁' }, score: '3 - 1', scores: { home: 3, away: 1 }, winner: 'home' },
        ];
        mockPredictions = [
            { sport: sport, matchName: 'Команда А vs. Команда Б', prediction: JSON.stringify({ "probabilities": { "П1": 55, "X": 25, "П2": 20 }, "coefficients": { "П1": 1.8, "X": 3.5, "П2": 4.0 }, "recommended_outcome": "П1" }) },
            { sport: sport, matchName: 'Команда X vs. Команда Y', prediction: JSON.stringify({ "probabilities": { "П1": 60, "X": 20, "П2": 20 }, "coefficients": { "П1": 1.6, "X": 4.0, "П2": 5.0 }, "recommended_outcome": "П1" }) },
        ];
    } else if (sport === 'basketball' || sport === 'nba') {
        mockMatches = [
            { sport: sport, eventName: 'Mock NBA', teams: 'Лейкерс vs. Клипперс', date: '2024-07-28', time: '18:00', isHotMatch: true, status: { long: 'Not Started', short: 'NS', emoji: '⏳' } },
            { sport: sport, eventName: 'Mock Euroleague', teams: 'ЦСКА vs. Реал Мадрид', date: '2024-07-28', time: '16:00', isHotMatch: false, status: { long: 'Finished', short: 'FT', emoji: '🏁' }, score: '91 - 88', scores: { home: 91, away: 88 }, winner: 'home' },
        ];
        mockPredictions = [
            { sport: sport, matchName: 'Лейкерс vs. Клипперс', prediction: JSON.stringify({ "probabilities": { "П1 (с ОТ)": 52, "П2 (с ОТ)": 48 }, "coefficients": { "П1 (с ОТ)": 1.9, "П2 (с ОТ)": 1.9 }, "recommended_outcome": "П1 (с ОТ)" }) },
            { sport: sport, matchName: 'ЦСКА vs. Реал Мадрид', prediction: JSON.stringify({ "probabilities": { "П1 (с ОТ)": 65, "П2 (с ОТ)": 35 }, "coefficients": { "П1 (с ОТ)": 1.5, "П2 (с ОТ)": 2.5 }, "recommended_outcome": "П1 (с ОТ)" }) },
        ];
    }


    res.json({
        matches: mockMatches,
        newPredictions: mockPredictions
    });
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