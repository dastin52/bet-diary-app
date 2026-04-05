import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { runUpdate, cache } from './server/prediction-updater.ts';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
    const app = express();
    const port = process.env.PORT || 3000;

    app.use(cors());
    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

    // --- GEMINI SETUP ---
    let ai: GoogleGenAI | null = null;
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set in .env file. AI features will not work.");
    } else {
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    // --- API ROUTES ---

    app.get('/api/health', (req, res) => {
        const lastTriggered = cache.getPersistent('last_run_triggered_timestamp') || null;
        const lastRun = cache.getPersistent('last_successful_run_timestamp') || null;
        const lastError = cache.getPersistent('last_run_error') || null;
        const healthStatus = {
            status: "ok",
            timestamp: new Date().toISOString(),
            apiKeys: {
                gemini: process.env.GEMINI_API_KEY ? 'CONFIGURED' : 'MISSING',
                sportsApi: process.env.SPORT_API_KEY ? 'CONFIGURED (will use real API)' : 'MISSING (will use mocks)',
            },
            lastTriggered,
            lastSuccessfulUpdate: lastRun,
            lastUpdateError: lastError,
        };
        res.json(healthStatus);
    });

    app.get('/api/debug', (req, res) => {
        res.json({
            timestamp: new Date().toISOString(),
            env: {
                hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
                hasGeminiKey: !!process.env.GEMINI_API_KEY,
                nodeEnv: process.env.NODE_ENV || 'development',
            }
        });
    });

    app.get('/api/admin/activity', (req, res) => {
        const logs = cache.getPersistent('api_activity_log') || [];
        res.json(logs);
    });

    app.post('/api/auth/telegram', async (req, res) => {
        try {
            const { initData } = req.body;
            if (!initData) return res.status(400).json({ error: 'Missing initData' });

            const urlParams = new URLSearchParams(initData);
            const userStr = urlParams.get('user');
            if (!userStr) return res.status(400).json({ error: 'No user data found' });
            
            const telegramUser = JSON.parse(userStr);
            const userStateKey = `tgstate:${telegramUser.id}`;
            let userState = cache.getPersistent(userStateKey);

            if (!userState) {
                const user = {
                    email: `${telegramUser.id}@telegram.twa`,
                    nickname: telegramUser.username || telegramUser.first_name || `User${telegramUser.id}`,
                    password_hash: 'twa_auth',
                    registeredAt: new Date().toISOString(),
                    referralCode: `TWA${telegramUser.id}`,
                    buttercups: 0,
                    status: 'active',
                    telegramId: telegramUser.id,
                    telegramUsername: telegramUser.username,
                    source: 'telegram'
                };

                userState = {
                    user: user,
                    bets: [],
                    bankroll: 10000,
                    goals: [],
                    bankHistory: [],
                    aiPredictions: [],
                    dialog: null
                };
                cache.putPersistent(userStateKey, userState);
                
                const listKey = 'tgusers:list';
                const list = cache.getPersistent(listKey) || [];
                if (!list.includes(user.email)) {
                    list.push(user.email);
                    cache.putPersistent(listKey, list);
                }
            } else {
                if (telegramUser.username && userState.user.telegramUsername !== telegramUser.username) {
                    userState.user.telegramUsername = telegramUser.username;
                    cache.putPersistent(userStateKey, userState);
                }
            }

            res.json(userState.user);
        } catch (e) {
            console.error("TWA Auth Error:", e);
            res.status(500).json({ error: 'Auth failed' });
        }
    });

    app.get('/api/matches', async (req, res) => {
        const sport = req.query.sport as string;
        if (!sport) return res.status(400).json({ error: 'Sport required' });
        
        const predictions = cache.getPersistent(`central_predictions:${sport}`) || [];
        res.json(predictions);
    });

    app.get('/api/matches-with-predictions', async (req, res) => {
        const sport = req.query.sport as string;
        if (!sport) return res.status(400).json({ error: 'Sport required' });
        
        const predictions = cache.getPersistent(`central_predictions:${sport}`) || [];
        res.json(predictions);
    });

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
            
            const result = await ai.models.generateContent(payload);
            const response = { text: result.text, sources: result.candidates?.[0]?.groundingMetadata?.groundingChunks };
            res.json(response);

        } catch (error) {
            console.error('API proxy error:', error);
            res.status(500).json({ error: 'Failed to process API request on the server.' });
        }
    });

    app.post('/api/tasks/run-update', async (req, res) => {
        console.log('[API] Manual prediction update triggered.');
        try {
            const result = await runUpdate();
            if (result.success) {
                res.status(200).json({ message: 'Обновление прогнозов успешно завершено.' });
            } else {
                res.status(500).json({ error: result.message || 'Произошла неизвестная ошибка во время обновления.' });
            }
        } catch (err: any) {
            console.error('Manual update run failed:', err);
            const errorMessage = err instanceof Error ? err.message : 'Произошла неизвестная ошибка на сервере.';
            res.status(500).json({ error: `Не удалось завершить обновление. ${errorMessage}` });
        }
    });

    app.get('/api/admin/users', (req, res) => {
        const mockBotOnlyUsers = [
            {
                email: 'botuser1@telegram.bot', nickname: 'TelegramFan', password_hash: '', 
                registeredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                referralCode: 'BOTREF123', buttercups: 0, status: 'active',
                telegramId: 987654321, telegramUsername: 'telegramfan', source: 'telegram',
            }
        ];
        res.json({ users: mockBotOnlyUsers });
    });

    // --- TELEGRAM BOT LOCAL DEV ROUTES ---
    const tempAuthCodes = new Map();

    app.post('/api/telegram/generate-code', (req, res) => {
        const { email, userData } = req.body;
        if (!email || !userData) {
            return res.status(400).json({ error: 'Email and userData are required.' });
        }
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes
        tempAuthCodes.set(code, { userData, expiry });
        
        console.log(`[LOCAL DEV] Generated Telegram code ${code} for ${email}`);
        res.json({ code });
    });

    // --- VITE MIDDLEWARE ---
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    // --- INITIAL UPDATE ---
    console.log('Running initial prediction update on startup...');
    try {
        await runUpdate();
        console.log('Initial prediction update complete.');
    } catch (err) {
        console.error('Initial update run failed:', err);
    }

    app.listen(port, '0.0.0.0', () => {
        console.log(`Server running at http://localhost:${port}`);
        
        setInterval(() => {
            console.log('Hourly prediction update...');
            runUpdate().catch(err => console.error('Hourly update run failed:', err));
        }, 3600 * 1000);
    });
}

startServer();
