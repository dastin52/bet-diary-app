require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const { runUpdate } = require('./server/prediction-updater');
const { cache } = require('./server/prediction-updater');


// --- INITIALIZATION ---
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// --- GEMINI SETUP ---
let ai;
if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set in .env file. AI features will not work.");
} else {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}


// --- WEB APP API ROUTES ---

// Health check endpoint for diagnostics
app.get('/api/health', (req, res) => {
    const lastRun = cache.getPersistent('last_successful_run_timestamp') || 'Not run yet';
    const lastError = cache.getPersistent('last_run_error') || null;
    const healthStatus = {
        status: "ok",
        timestamp: new Date().toISOString(),
        apiKeys: {
            gemini: process.env.GEMINI_API_KEY ? 'CONFIGURED' : 'MISSING',
            sportsApi: process.env.SPORT_API_KEY ? 'CONFIGURED' : 'NOT_APPLICABLE_IN_LOCAL_DEV (uses mocks)',
        },
        kvBinding: 'NOT_APPLICABLE_IN_LOCAL_DEV (uses file cache)',
        lastSuccessfulUpdate: lastRun,
        lastUpdateError: lastError,
    };
    res.json(healthStatus);
});


// Secure proxy endpoint for the web app
app.post('/api/gemini', async (req, res) => {
  try {
    const { endpoint, payload } = req.body;

    if (endpoint === 'getAllPredictions') {
        const allPredictions = cache.getPersistent('central_predictions:all') || [];
        return res.json(allPredictions);
    }
    
    if (endpoint === 'getMatchesWithPredictions') {
        const { sport } = payload;
        if (!sport) {
            return res.status(400).json({ error: 'Sport parameter is required' });
        }
        const predictions = cache.getPersistent(`central_predictions:${sport}`) || [];
        return res.json(predictions);
    }

    if (!ai) {
        return res.status(500).json({ error: 'API Key for Gemini is not configured on the server.' });
    }
    
    // Default to Gemini proxy
    const result = await ai.models.generateContent(payload);
    const response = { text: result.text, sources: result.candidates?.[0]?.groundingMetadata?.groundingChunks };
    res.json(response);

  } catch (error) {
    console.error('API proxy error:', error);
    res.status(500).json({ error: 'Failed to process API request on the server.' });
  }
});

// Endpoint to manually trigger update
app.post('/api/tasks/run-update', async (req, res) => {
    console.log('[API] Manual prediction update triggered.');
    try {
        const result = await runUpdate();
        if (result.success) {
            res.status(200).json({ message: 'Обновление прогнозов успешно завершено.' });
        } else {
            // This case might not be hit if runUpdate throws, but it's good practice.
            res.status(500).json({ error: result.message || 'Произошла неизвестная ошибка во время обновления.' });
        }
    } catch (err) {
        console.error('Manual update run failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Произошла неизвестная ошибка на сервере.';
        res.status(500).json({ error: `Не удалось завершить обновление. ${errorMessage}` });
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
const startServer = async () => {
  console.log('Running initial prediction update on startup...');
  try {
    await runUpdate(); // Await the first run to ensure cache is populated
    console.log('Initial prediction update complete. Server is ready.');
  } catch (err) {
    console.error('Initial update run failed:', err);
  }

  app.listen(port, () => {
    console.log(`API server for local development listening at http://localhost:${port}`);
    console.log("This server provides API proxying for the web app.");

    // Run update every hour
    setInterval(() => {
      console.log('Hourly prediction update...');
      runUpdate().catch(err => console.error('Hourly update run failed:', err));
    }, 3600 * 1000); // 1 hour
  });
};

startServer();