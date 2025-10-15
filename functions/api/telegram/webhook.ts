// functions/api/telegram/webhook.ts

// --- TYPE DEFINITIONS ---
import { Bet, BetLeg, BetStatus, BetType, BankTransaction, BankTransactionType, User, Goal, GoalMetric, GoalStatus, Challenge, Achievement } from '../../../src/types';
import { SPORTS, BOOKMAKERS, BET_STATUS_OPTIONS, BET_TYPE_OPTIONS, MARKETS_BY_SPORT, WEEKLY_CHALLENGES } from '../../../src/constants';
import { GoogleGenAI } from "@google/genai";

// --- COMPETITION TYPES ---
type TimePeriod = 'week' | 'month' | 'year' | 'all_time';

interface ParticipantStats {
    rank: number;
    roi: number;
    totalBets: number;
    wonBets: number;
    lostBets: number;
    biggestWin: number;
    biggestLoss: number;
    totalStaked: number;
    totalProfit: number;
    achievements: Achievement[];
}

interface CompetitionParticipant {
    user: {
        nickname: string;
        email: string;
    };
    stats: ParticipantStats;
}

// --- CORE TYPES ---
interface Env {
    TELEGRAM_BOT_TOKEN: string;
    GEMINI_API_KEY: string;
    BOT_STATE: KVNamespace;
}

interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

// Full user data stored in KV for the bot
interface UserData {
    email: string;
    nickname: string;
    password_hash: string;
    registeredAt: string;
    referralCode: string;
    buttercups: number;
    status: 'active' | 'blocked';
    bankroll: number;
    bets: Bet[];
    bankHistory: BankTransaction[];
    goals: Goal[];
}

// Temporary state for multi-step dialogs
interface DialogState {
    action: string;
    data: any;
}

type Message = {
  role: 'user' | 'model';
  text: string;
};


interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
    message_id: number;
    from: { id: number; };
    chat: { id: number; type: 'private'; };
    date: number;
    text?: string;
}

interface TelegramCallbackQuery {
    id: string;
    from: { id: number; };
    message: TelegramMessage;
    data: string;
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (context: EventContext<E>) => Response | Promise<Response>;

// --- MOCK HASHING (for compatibility with frontend) ---
const mockHash = (password: string): string => `hashed_${password}`;

// --- RISK MANAGEMENT MODEL ---
const calculateRiskManagedStake = (bankroll: number, odds: number): { stake: number; percentage: number } | null => {
  if (bankroll <= 0 || odds <= 1) return null;
  let percentageOfBankroll: number;
  if (odds < 1.5) percentageOfBankroll = 0.025;
  else if (odds < 2.5) percentageOfBankroll = 0.015;
  else if (odds < 4.0) percentageOfBankroll = 0.0075;
  else percentageOfBankroll = 0.005;

  const recommendedStake = bankroll * Math.min(percentageOfBankroll, 0.05);
  if (recommendedStake < 1) return null;
  return { stake: recommendedStake, percentage: percentageOfBankroll * 100 };
};


// --- UTILS & HELPERS ---
const generateEventString = (legs: BetLeg[], betType: BetType, sport: string): string => {
    if (!legs || legs.length === 0) return 'Пустое событие';
    if (betType === BetType.Single && legs.length === 1) {
        const leg = legs[0];
        if (!leg.homeTeam || !leg.awayTeam || !leg.market) return 'Неполные данные';
        const eventName = ['Теннис', 'Бокс', 'ММА'].includes(sport) ? `${leg.homeTeam} - ${leg.awayTeam}` : `${leg.homeTeam} vs ${leg.awayTeam}`;
        return `${eventName} - ${leg.market}`;
    }
    if (betType === BetType.Parlay) {
        const count = legs.length;
        if (count === 0) return 'Экспресс (пустой)';
        const endings = { one: 'событие', few: 'события', many: 'событий' };
        const ending = (count % 10 === 1 && count % 100 !== 11) ? endings.one : (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) ? endings.few : endings.many;
        return `Экспресс (${count} ${ending})`;
    }
    return 'Системная ставка';
};

const calculateProfit = (bet: Omit<Bet, 'id' | 'createdAt' | 'event'>): number => {
  switch (bet.status) {
    case BetStatus.Won: return bet.stake * (bet.odds - 1);
    case BetStatus.Lost: return -bet.stake;
    case BetStatus.Void: return 0;
    case BetStatus.CashedOut: return bet.profit ?? 0;
    default: return 0;
  }
};


// --- TELEGRAM API HELPERS ---
async function apiRequest(token: string, method: string, body: object): Promise<any> {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error(`Telegram API error (${method}):`, data);
        }
        return data;
    } catch (error) {
        console.error(`Failed to call Telegram API (${method}):`, error);
        return null;
    }
}

const sendMessage = (token: string, chatId: number, text: string, reply_markup?: any) =>
    apiRequest(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', reply_markup });

const editMessageText = (token: string, chatId: number, messageId: number, text: string, reply_markup?: any) =>
    apiRequest(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown', reply_markup });

const answerCallbackQuery = (token: string, callbackQueryId: string, text?: string) =>
    apiRequest(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text });

const deleteMessage = (token: string, chatId: number, messageId: number) =>
    apiRequest(token, 'deleteMessage', { chat_id: chatId, message_id: messageId });


// --- KV DATA HELPERS ---
const getUserData = async (kv: KVNamespace, email: string): Promise<UserData | null> => {
    const data = await kv.get(`user:${email}`);
    return data ? JSON.parse(data) : null;
};
const saveUserData = async (kv: KVNamespace, email: string, data: UserData): Promise<void> => {
    await kv.put(`user:${email}`, JSON.stringify(data));
};
const getDialogState = async (kv: KVNamespace, userId: number): Promise<DialogState | null> => {
    const state = await kv.get(`dialog:${userId}`);
    return state ? JSON.parse(state) : null;
};
const setDialogState = async (kv: KVNamespace, userId: number, state: DialogState | null): Promise<void> => {
    if (state === null) {
        await kv.delete(`dialog:${userId}`);
    } else {
        const ttl = ['ai_chat_active', 'add_bet'].includes(state.action) ? 900 : 300;
        await kv.put(`dialog:${userId}`, JSON.stringify(state), { expirationTtl: ttl });
    }
};
const getEmailByNickname = async (kv: KVNamespace, nickname: string): Promise<string | null> => {
    return await kv.get(`nickname:${nickname.toLowerCase()}`);
};
const saveNicknameMapping = async (kv: KVNamespace, nickname: string, email: string): Promise<void> => {
    await kv.put(`nickname:${nickname.toLowerCase()}`, email);
};

// --- COMPETITION HELPERS ---
const ACHIEVEMENTS: { [key: string]: Achievement } = {
    ROI_KING: { id: 'ROI_KING', name: 'Король ROI', description: 'Самый высокий ROI за период', icon: '👑' },
    LUCKY_HAND: { id: 'LUCKY_HAND', name: 'Удачливая рука', description: 'Самый крупный выигрыш с одной ставки', icon: '💰' },
    CRAZY_LOSS: { id: 'CRAZY_LOSS', name: 'Безумный проигрыш', description: 'Самый крупный проигрыш с одной ставки', icon: '💸' },
    MARATHON_RUNNER: { id: 'MARATHON_RUNNER', name: 'Марафонец', description: 'Наибольшее количество сделанных ставок', icon: '🏃‍♂️' },
    PARLAY_KING: { id: 'PARLAY_KING', name: 'Король экспрессов', description: 'Самый высокий выигранный коэффициент в экспрессе', icon: '🚂' },
};

const getPeriodStart = (period: 'week' | 'month' | 'year'): Date => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (period) {
        case 'week':
            const dayOfWeek = today.getDay();
            const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            return new Date(today.setDate(diff));
        case 'month': return new Date(today.getFullYear(), today.getMonth(), 1);
        case 'year': return new Date(today.getFullYear(), 0, 1);
    }
};

const getAllUsersData = async (kv: KVNamespace): Promise<UserData[]> => {
    const userListJson = await kv.get('user_list');
    if (!userListJson) return [];
    const userEmails = JSON.parse(userListJson) as string[];
    const userPromises = userEmails.map(email => getUserData(kv, email));
    const usersData = await Promise.all(userPromises);
    return usersData.filter((u): u is UserData => u !== null);
};

// --- AI HELPERS ---
const generalSystemInstruction = (currentDate: string) => `Вы — эксперт-аналитик по спортивным ставкам. Сегодняшняя дата: ${currentDate}. Всегда используй эту дату как точку отсчета для любых запросов о текущих или будущих событиях. Ваша цель — анализировать производительность пользователя или давать прогнозы на матчи. 1. **Анализ производительности:** Если пользователь просит проанализировать его эффективность, используйте предоставленные сводные данные и дайте высокоуровневые советы по стратегии. 2. **Прогноз на матч:** - Когда вас просят проанализировать предстоящий или текущий матч, используйте поиск в реальном времени. Будьте внимательны к датам, ориентируясь на ${currentDate} как на "сегодня". - Проводите глубокий анализ: статистика, форма, история встреч, новости. - Предоставьте краткий, но содержательный обзор. - **В завершение ОБЯЗАТЕЛЬНО дайте прогноз в процентном соотношении на основные исходы** (например, П1, X, П2) и порекомендуйте наиболее вероятный исход. Всегда поощряйте ответственную игру. Не давайте прямых финансовых советов. Отвечайте на русском языке.`;

const calculateAnalytics = (bets: Bet[], bankroll: number, bankHistory: BankTransaction[]) => {
    const settledBets = bets.filter(b => b.status !== BetStatus.Pending);
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const betCount = settledBets.length;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void).length;
    const winRate = nonVoidBets > 0 ? (wonBets / nonVoidBets) * 100 : 0;
    
    const profitBySport = settledBets.reduce((acc, bet) => {
        acc[bet.sport] = (acc[bet.sport] || 0) + (bet.profit ?? 0);
        return acc;
    }, {} as Record<string, number>);

    const profitByBetType = settledBets.reduce((acc, bet) => {
        acc[bet.betType] = (acc[bet.betType] || 0) + (bet.profit ?? 0);
        return acc;
    }, {} as Record<string, number>);

    return {
        totalProfit, roi, betCount, winRate,
        profitBySport: Object.entries(profitBySport).map(([sport, profit]) => ({ sport, profit })),
        profitByBetType: Object.entries(profitByBetType).map(([type, profit]) => ({ type, profit })),
    };
};

function analyticsToText(analytics: any): string {
    return `Вот сводные данные по ставкам пользователя для анализа:\n- Общая прибыль: ${analytics.totalProfit.toFixed(2)}\n- ROI: ${analytics.roi.toFixed(2)}%\n- Количество ставок: ${analytics.betCount}\n- Процент выигрышей: ${analytics.winRate.toFixed(2)}%\n- Прибыль по видам спорта: ${JSON.stringify(analytics.profitBySport.map(p => `${p.sport}: ${p.profit.toFixed(2)}`))}\n- Прибыль по типам ставок: ${JSON.stringify(analytics.profitByBetType.map(p => `${p.type}: ${p.profit.toFixed(2)}`))}`;
}


// --- MENUS & KEYBOARDS ---
const getMainMenu = (isLinked: boolean) => ({
    inline_keyboard: [
        [{ text: "📝 Добавить ставку", callback_data: "add_bet" }, { text: "📈 Управление ставками", callback_data: "manage_bets" }],
        [{ text: "📊 Просмотр статистики", callback_data: "view_stats" }, { text: "💰 Управление банком", callback_data: "bank_management" }],
        [{ text: "🤖 AI-Аналитик", callback_data: "ai_chat" }],
        [{ text: "🏆 Соревнования", callback_data: "competition_menu" }]
    ]
});

const getNewUserMenu = () => ({ inline_keyboard: [[{ text: "✍️ Регистрация в боте", callback_data: "register" }], [{ text: "🔗 У меня есть аккаунт", callback_data: "link_account" }]] });
const getBankMenu = (bankroll: number) => ({ inline_keyboard: [[{ text: `➕ Пополнить (вручную)`, callback_data: "deposit" }], [{ text: `➖ Снять (вручную)`, callback_data: "withdraw" }], [{ text: "⬅️ Назад в меню", callback_data: "main_menu" }]] });
const getCompetitionsMenu = () => ({ inline_keyboard: [[{ text: "🏅 Таблицы лидеров", callback_data: "show_leaderboards" }], [{ text: "🎯 Еженедельные челленджи", callback_data: "show_challenges" }], [{ text: "⬅️ Назад в меню", callback_data: "main_menu" }]] });
const getLeaderboardTypeMenu = () => ({ inline_keyboard: [
    [{ text: "👑 Короли ROI", callback_data: "leaderboard_select_period:roi" }, { text: "💰 Топ выигрыши", callback_data: "leaderboard_select_period:top_winners" }],
    [{ text: "💸 Клуб 'Неповезло'", callback_data: "leaderboard_select_period:unluckiest" }, { text: "🏃‍♂️ Самые активные", callback_data: "leaderboard_select_period:most_active" }],
    [{ text: "⬅️ К соревнованиям", callback_data: "competition_menu" }]
] });
const getLeaderboardPeriodMenu = (type: string) => ({ inline_keyboard: [
    [{ text: "Неделя", callback_data: `leaderboard_show:${type}:week` }, { text: "Месяц", callback_data: `leaderboard_show:${type}:month` }],
    [{ text: "Год", callback_data: `leaderboard_show:${type}:year` }, { text: "Все время", callback_data: `leaderboard_show:${type}:all_time` }],
    [{ text: "⬅️ К выбору таблицы", callback_data: "show_leaderboards" }]
] });


async function sendNewUserWelcome(token: string, chatId: number, messageId?: number) {
    const welcomeText = "👋 *Добро пожаловать в Дневник Ставок!*\n\nЭтот бот — ваш помощник для быстрого доступа к функциям сайта.\n\nЕсли у вас еще нет аккаунта, нажмите 'Регистрация'. Если уже есть — привяжите его.";
    const menu = getNewUserMenu();
    if (messageId) { await editMessageText(token, chatId, messageId, welcomeText, menu); } else { await sendMessage(token, chatId, welcomeText, menu); }
}

function createSportKeyboard() {
    const keyboard = [];
    for (let i = 0; i < SPORTS.length; i += 3) { keyboard.push(SPORTS.slice(i, i + 3).map(sport => ({ text: sport, callback_data: `add_bet_data:sport:${sport}` }))); }
    keyboard.push([{ text: "❌ Отмена", callback_data: "main_menu" }]);
    return { inline_keyboard: keyboard };
}

function createMarketKeyboard(sport: string, page = 0) {
    const markets = MARKETS_BY_SPORT[sport] || [];
    const itemsPerPage = 9;
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedMarkets = markets.slice(start, end);
    const keyboard = [];
    for (let i = 0; i < paginatedMarkets.length; i += 3) { keyboard.push(paginatedMarkets.slice(i, i + 3).map(market => ({ text: market, callback_data: `add_bet_data:market:${market}` }))); }
    const navigation = [];
    if (page > 0) navigation.push({ text: "⬅️", callback_data: `add_bet_page:market:${page - 1}` });
    if (end < markets.length) navigation.push({ text: "➡️", callback_data: `add_bet_page:market:${page + 1}` });
    if (navigation.length > 0) keyboard.push(navigation);
    keyboard.push([{ text: "↩️ Изменить событие", callback_data: "add_bet_step:2" }, { text: "❌ Отмена", callback_data: "main_menu" }]);
    return { inline_keyboard: keyboard };
}

// --- MAIN HANDLER ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.BOT_STATE || !env.GEMINI_API_KEY) {
        console.error("FATAL: Environment variables (Telegram Token, KV, Gemini Key) are not configured.");
        return new Response('Server configuration error', { status: 500 });
    }
    
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const requestClone = request.clone();
    
    try {
        const update = await request.json() as TelegramUpdate;
        const message = update.message || update.callback_query?.message;
        const text = update.message?.text?.trim();
        const chatId = message?.chat.id;
        const userId = update.callback_query?.from.id || update.message?.from.id;
        const callbackQueryId = update.callback_query?.id;
        const callbackData = update.callback_query?.data;
        const messageId = message?.message_id;

        if (!chatId || !userId) return new Response('OK');
        
        const userLinkKey = `telegram:${userId}`;
        const userEmail = await env.BOT_STATE.get(userLinkKey);
        
        if (text && text.startsWith('/')) {
            await setDialogState(env.BOT_STATE, userId, null);
            switch (text.split(' ')[0]) {
                case '/start':
                case '/menu':
                    if (userEmail) {
                        const userData = await getUserData(env.BOT_STATE, userEmail);
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `С возвращением, ${userData?.nickname || 'пользователь'}! 👋\n\nЧем могу помочь?`, getMainMenu(true));
                    } else {
                        await sendNewUserWelcome(env.TELEGRAM_BOT_TOKEN, chatId);
                    }
                    return new Response('OK');
                case '/aichat':
                     if (userEmail) {
                        await setDialogState(env.BOT_STATE, userId, { action: 'ai_chat_active', data: { history: [] } });
                        const aiWelcomeText = "🤖 *Добро пожаловать в чат с AI-Аналитиком!*\n\nЗадайте свой вопрос.";
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiWelcomeText, { inline_keyboard: [[{ text: "⬅️ Выйти из чата", callback_data: "main_menu" }]] });
                     } else {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Пожалуйста, сначала привяжите аккаунт или зарегистрируйтесь.");
                        await sendNewUserWelcome(env.TELEGRAM_BOT_TOKEN, chatId);
                     }
                     return new Response('OK');
            }
        }

        if (callbackQueryId) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQueryId);
            const [action, ...params] = callbackData.split(':');
            
            switch(action) {
                case 'start_new_user': if (messageId) await sendNewUserWelcome(env.TELEGRAM_BOT_TOKEN, chatId, messageId); return new Response('OK');
                case 'register':
                    await setDialogState(env.BOT_STATE, userId, { action: 'register_ask_email', data: {} });
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "✍️ *Регистрация*\n\nПожалуйста, введите ваш email-адрес.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] });
                    return new Response('OK');
                case 'link_account':
                     await setDialogState(env.BOT_STATE, userId, { action: 'link_ask_code', data: {} });
                     const instructionText = "🔐 *Привязка аккаунта*\n\n1. Откройте сайт Дневника Ставок.\n2. Перейдите в *Настройки* ➝ *Интеграция с Telegram*.\n3. Нажмите *'Сгенерировать код'*.\n4. Отправьте полученный 6-значный код в этот чат.";
                     const backButtonCallback = userEmail ? "main_menu" : "start_new_user";
                     if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, instructionText, { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: backButtonCallback }]] });
                     else await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, instructionText);
                     return new Response('OK');
            }

            if (!userEmail) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Действие недоступно. Пожалуйста, сначала зарегистрируйтесь или привяжите свой аккаунт.");
                await sendNewUserWelcome(env.TELEGRAM_BOT_TOKEN, chatId);
                return new Response('OK');
            }

            const userData = await getUserData(env.BOT_STATE, userEmail);
            if (!userData) {
                 await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Ошибка: не удалось загрузить данные вашего аккаунта. Попробуйте перепривязать аккаунт.");
                 await env.BOT_STATE.delete(userLinkKey);
                 return new Response('OK');
            }
            
            if (action.startsWith('add_bet')) {
                const dialogState = await getDialogState(env.BOT_STATE, userId) || { action: 'add_bet', data: { step: 1 } };
                if (dialogState.action !== 'add_bet') return new Response('OK');

                switch(action) {
                    case 'add_bet':
                        dialogState.data = { step: 1 };
                        await setDialogState(env.BOT_STATE, userId, dialogState);
                        if(messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "📝 *Новая ставка (Шаг 1/5)*\n\nВыберите вид спорта:", createSportKeyboard());
                        return new Response('OK');
                    case 'add_bet_step':
                        dialogState.data.step = parseInt(params[0]);
                        dialogState.data.botMessageId = messageId;
                        await setDialogState(env.BOT_STATE, userId, dialogState);
                        break;
                    case 'add_bet_data':
                        const [dataType, ...valueParts] = params;
                        const value = valueParts.join(':');
                        dialogState.data[dataType] = dataType === 'stake' ? parseFloat(value) : value;
                        dialogState.data.step++;
                        dialogState.data.botMessageId = messageId;
                        await setDialogState(env.BOT_STATE, userId, dialogState);
                        break;
                    case 'add_bet_page':
                        if(messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "Выберите исход:", createMarketKeyboard(dialogState.data.sport, parseInt(params[0])));
                        return new Response('OK');
                    case 'add_bet_save':
                        const betData = dialogState.data;
                        const newBet: Bet = {
                            sport: betData.sport, legs: [{ homeTeam: betData.homeTeam, awayTeam: betData.awayTeam, market: betData.market }],
                            bookmaker: 'Telegram', betType: BetType.Single, stake: betData.stake, odds: betData.odds,
                            status: BetStatus.Pending, id: new Date().toISOString() + Math.random(), createdAt: new Date().toISOString(),
                            event: generateEventString([{ homeTeam: betData.homeTeam, awayTeam: betData.awayTeam, market: betData.market }], BetType.Single, betData.sport),
                            tags: ['telegram'],
                        };
                        userData.bets.unshift(newBet);
                        await saveUserData(env.BOT_STATE, userEmail, userData);
                        await setDialogState(env.BOT_STATE, userId, null);
                        if(messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `✅ Ставка успешно добавлена:\n*${newBet.event}*`, getMainMenu(true));
                        return new Response('OK');
                }

                const currentStep = dialogState.data.step;
                const botMessageId = dialogState.data.botMessageId;
                switch (currentStep) {
                    case 1: if(botMessageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, botMessageId, "📝 *Новая ставка (Шаг 1/5)*\n\nВыберите вид спорта:", createSportKeyboard()); break;
                    case 2:
                        const isIndividual = ['Теннис', 'Бокс', 'ММА'].includes(dialogState.data.sport);
                        const teamExample = isIndividual ? "Джокович - Алькарас" : "Реал Мадрид - Барселона";
                        if(botMessageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, botMessageId, `📝 *Новая ставка (Шаг 2/5)*\n\nВведите событие в формате:\n\`Команда 1 - Команда 2\`\n\n*Пример:* \`${teamExample}\``, { inline_keyboard: [[{ text: "↩️ Изменить спорт", callback_data: "add_bet_step:1" }]] });
                        break;
                    case 3: if(botMessageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, botMessageId, "📝 *Новая ставка (Шаг 3/5)*\n\nВыберите исход:", createMarketKeyboard(dialogState.data.sport)); break;
                    case 4:
                        const recommendation = calculateRiskManagedStake(userData.bankroll, 2.0);
                        let stakeText = "📝 *Новая ставка (Шаг 4/5)*\n\nВведите сумму ставки (₽).";
                        const keyboardButtons = [];
                        if (recommendation) {
                            stakeText += `\n\n💡 *Рекомендация:* ${recommendation.stake.toFixed(0)} ₽ (${recommendation.percentage.toFixed(1)}% от банка)`;
                            const recommendedStakeValue = recommendation.stake.toFixed(0);
                            keyboardButtons.push([{ text: `💡 Использовать ${recommendedStakeValue} ₽`, callback_data: `add_bet_data:stake:${recommendedStakeValue}` }]);
                        }
                        keyboardButtons.push([{ text: "↩️ Изменить исход", callback_data: "add_bet_step:3" }]);
                        if(botMessageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, botMessageId, stakeText, { inline_keyboard: keyboardButtons });
                        break;
                    case 5: if(botMessageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, botMessageId, "📝 *Новая ставка (Шаг 5/5)*\n\nВведите коэффициент.", { inline_keyboard: [[{ text: "↩️ Изменить сумму", callback_data: "add_bet_step:4" }]] }); break;
                    case 6:
                        const confirmText = `🔍 *Проверьте данные ставки:*\n\n` + `*Спорт:* ${dialogState.data.sport}\n` + `*Событие:* ${dialogState.data.homeTeam} - ${dialogState.data.awayTeam}\n` + `*Исход:* ${dialogState.data.market}\n` + `*Сумма:* ${dialogState.data.stake} ₽\n` + `*Коэффициент:* ${dialogState.data.odds}\n\n` + `Все верно?`;
                        if (botMessageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, botMessageId, confirmText, { inline_keyboard: [[{ text: "✅ Сохранить", callback_data: "add_bet_save" }, { text: "✏️ Начать заново", callback_data: "add_bet_step:1" }]] });
                        break;
                }
                return new Response('OK');
            }

            switch (action) {
                case 'main_menu':
                    await setDialogState(env.BOT_STATE, userId, null);
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `С возвращением, ${userData?.nickname || 'пользователь'}! 👋\n\nЧем могу помочь?`, getMainMenu(true));
                    return new Response('OK');
                
                case 'ai_chat':
                    await setDialogState(env.BOT_STATE, userId, { action: 'ai_chat_active', data: { history: [] } });
                    const aiWelcomeText = "🤖 *Добро пожаловать в чат с AI-Аналитиком!*\n\nВы можете задать вопрос о своей статистике, попросить проанализировать предстоящий матч или обсудить стратегию.\n\n*Например:*\n- `Проанализируй мою эффективность`\n- `Какие слабые места в моей стратегии?`\n- `Сделай прогноз на матч Реал Мадрид - Бавария`";
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, aiWelcomeText, { inline_keyboard: [[{ text: "⬅️ Выйти из чата", callback_data: "main_menu" }]] });
                    return new Response('OK');

                case 'view_stats':
                    const analytics = calculateAnalytics(userData.bets, userData.bankroll, userData.bankHistory);
                    const statsText = `📊 *Ваша статистика:*\n\n` + `💰 *Текущий банк:* ${userData.bankroll.toFixed(2)} ₽\n` + `📈 *Общая прибыль:* ${analytics.totalProfit >= 0 ? '+' : ''}${analytics.totalProfit.toFixed(2)} ₽\n` + `🎯 *ROI:* ${analytics.roi.toFixed(2)}%\n` + `✅ *Процент побед:* ${analytics.winRate.toFixed(2)}%\n` + `📋 *Всего ставок:* ${analytics.betCount}`;
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, statsText, { inline_keyboard: [[{ text: "⬅️ Назад в меню", callback_data: "main_menu" }]] });
                    return new Response('OK');
                
                case 'manage_bets':
                    const pendingBets = userData.bets.filter(b => b.status === BetStatus.Pending).slice(0, 5);
                    let manageText = "📈 *Управление ставками*\n\nВыберите ставку для обновления статуса:";
                    const keyboard = [];
                    if (pendingBets.length > 0) {
                        for (const bet of pendingBets) { keyboard.push([{ text: `[${bet.sport}] ${bet.event}`, callback_data: `show_bet:${bet.id}` }]); }
                    } else {
                        manageText = "📈 *Управление ставками*\n\nУ вас нет ставок в ожидании.";
                    }
                    keyboard.push([{ text: "⬅️ Назад в меню", callback_data: "main_menu" }]);
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, manageText, { inline_keyboard: keyboard });
                    return new Response('OK');
                
                case 'show_bet':
                    const betIdToShow = callbackData.substring('show_bet:'.length);
                    const betToShow = userData.bets.find(b => b.id === betIdToShow);
                    if (!betToShow) {
                        if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "❌ Ставка не найдена.", { inline_keyboard: [[{ text: "⬅️ К списку ставок", callback_data: "manage_bets" }]] });
                        return new Response('OK');
                    }
                    const betDetailsText = `*Детали ставки:*\n` + `*Событие:* ${betToShow.event}\n` + `*Сумма:* ${betToShow.stake} ₽\n` + `*Коэф.:* ${betToShow.odds}\n\n` + `*Как она сыграла?*`;
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, betDetailsText, { inline_keyboard: [[{ text: "✅ Выигрыш", callback_data: `set_status:${betToShow.id}:won` }], [{ text: "❌ Проигрыш", callback_data: `set_status:${betToShow.id}:lost` }], [{ text: "🔄 Возврат", callback_data: `set_status:${betToShow.id}:void` }], [{ text: "⬅️ К списку ставок", callback_data: "manage_bets" }]] });
                    return new Response('OK');

                case 'set_status':
                    const setStatusParts = callbackData.split(':');
                    setStatusParts.shift();
                    const newStatus = setStatusParts.pop() as BetStatus;
                    const betIdToSet = setStatusParts.join(':');
                    const betIndex = userData.bets.findIndex(b => b.id === betIdToSet);
                    if (betIndex === -1) {
                         if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "❌ Ставка не найдена.", { inline_keyboard: [[{ text: "⬅️ К списку ставок", callback_data: "manage_bets" }]] });
                         return new Response('OK');
                    }
                    const betToUpdate = userData.bets[betIndex];
                    if (betToUpdate.status !== BetStatus.Pending) {
                        if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `⚠️ Статус этой ставки уже '${BET_STATUS_OPTIONS.find(o => o.value === betToUpdate.status)?.label}'.`, { inline_keyboard: [[{ text: "⬅️ К списку ставок", callback_data: "manage_bets" }]] });
                        return new Response('OK');
                    }
                    betToUpdate.status = newStatus;
                    const profit = calculateProfit(betToUpdate);
                    betToUpdate.profit = profit;
                    userData.bets[betIndex] = betToUpdate;
                    let transactionType = BankTransactionType.Correction;
                    if (newStatus === BetStatus.Won) transactionType = BankTransactionType.BetWin;
                    if (newStatus === BetStatus.Lost) transactionType = BankTransactionType.BetLoss;
                    if (newStatus === BetStatus.Void) transactionType = BankTransactionType.BetVoid;
                    if (profit !== 0 || newStatus === BetStatus.Void) {
                        const transaction: BankTransaction = { id: new Date().toISOString() + Math.random(), timestamp: new Date().toISOString(), type: transactionType, amount: profit, previousBalance: userData.bankroll, newBalance: userData.bankroll + profit, description: `${BET_STATUS_OPTIONS.find(o=>o.value === newStatus)?.label}: ${betToUpdate.event}`, betId: betToUpdate.id };
                        userData.bankroll += profit;
                        userData.bankHistory.unshift(transaction);
                    }
                    await saveUserData(env.BOT_STATE, userEmail, userData);
                    const confirmationText = `✅ Статус для *${betToUpdate.event}* обновлен на *${BET_STATUS_OPTIONS.find(o=>o.value === newStatus)?.label}*.\nПрибыль: ${profit.toFixed(2)} ₽`;
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, confirmationText, { inline_keyboard: [[{ text: "⬅️ К списку ставок", callback_data: "manage_bets" }]] });
                    return new Response('OK');

                case 'bank_management':
                    const bankText = `💰 *Управление банком*\n\nВаш текущий баланс: *${userData.bankroll.toFixed(2)} ₽*\n\nЗдесь вы можете вручную скорректировать свой банк, например, после пополнения счета у букмекера или вывода средств.`;
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, bankText, getBankMenu(userData.bankroll));
                    return new Response('OK');
                
                case 'deposit':
                    await setDialogState(env.BOT_STATE, userId, { action: 'ask_deposit_amount', data: {} });
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "➕ Введите сумму пополнения:", { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "bank_management" }]] });
                    return new Response('OK');
                
                case 'withdraw':
                     await setDialogState(env.BOT_STATE, userId, { action: 'ask_withdraw_amount', data: {} });
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "➖ Введите сумму для снятия:", { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "bank_management" }]] });
                    return new Response('OK');
                
                // --- COMPETITION ACTIONS ---
                case 'competition_menu':
                     if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "🏆 *Соревнования*\n\nВыберите раздел для просмотра:", getCompetitionsMenu());
                     return new Response('OK');

                case 'show_leaderboards':
                     if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "🏅 *Таблицы лидеров*\n\nВыберите категорию:", getLeaderboardTypeMenu());
                     return new Response('OK');
                
                case 'leaderboard_select_period':
                     const type = params[0];
                     if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `*Таблица лидеров*\n\nВыберите период:`, getLeaderboardPeriodMenu(type));
                     return new Response('OK');
                
                case 'leaderboard_show':
                    if (messageId) {
                        await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "⏳ Загружаю данные всех игроков и считаю рейтинг...");
                        const [l_type, l_period] = params;
                        const allUsersData = await getAllUsersData(env.BOT_STATE);

                        if(allUsersData.length === 0) {
                            await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "Нет данных для построения таблицы.", { inline_keyboard: [[{ text: "⬅️ К соревнованиям", callback_data: "competition_menu" }]] });
                            return new Response('OK');
                        }

                        // --- Calculation Logic (adapted from useCompetitionData) ---
                        const periodStartDate = l_period === 'all_time' ? null : getPeriodStart(l_period as any);
                        const participantRawData = allUsersData.map(user => {
                            const periodBets = periodStartDate ? user.bets.filter(b => new Date(b.createdAt) >= periodStartDate) : user.bets;
                            const settledBets = periodBets.filter(b => b.status !== BetStatus.Pending && b.status !== BetStatus.Void);
                            const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
                            const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
                            const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
                            const wins = settledBets.filter(b => b.status === BetStatus.Won);
                            const losses = settledBets.filter(b => b.status === BetStatus.Lost);
                            return {
                                user: { nickname: user.nickname, email: user.email },
                                stats: {
                                    roi, totalBets: settledBets.length,
                                    biggestWin: wins.length > 0 ? Math.max(...wins.map(b => b.profit ?? 0)) : 0,
                                    biggestLoss: losses.length > 0 ? Math.min(...losses.map(b => b.profit ?? 0)) : 0,
                                }
                            };
                        }).filter(p => p.stats.totalBets > 0);

                        let sortedBoard;
                        let title, formatFn;

                        switch(l_type) {
                            case 'top_winners':
                                sortedBoard = participantRawData.sort((a,b) => b.stats.biggestWin - a.stats.biggestWin);
                                title = '💰 Топ выигрыши';
                                formatFn = (p: any) => `*${p.stats.biggestWin.toFixed(2)} ₽*`;
                                break;
                            case 'unluckiest':
                                sortedBoard = participantRawData.sort((a,b) => a.stats.biggestLoss - b.stats.biggestLoss);
                                title = '💸 Клуб "Неповезло"';
                                formatFn = (p: any) => `*${p.stats.biggestLoss.toFixed(2)} ₽*`;
                                break;
                            case 'most_active':
                                sortedBoard = participantRawData.sort((a,b) => b.stats.totalBets - a.stats.totalBets);
                                title = '🏃‍♂️ Самые активные';
                                formatFn = (p: any) => `*${p.stats.totalBets}* ставок`;
                                break;
                            default: // ROI
                                sortedBoard = participantRawData.sort((a,b) => b.stats.roi - a.stats.roi);
                                title = '👑 Короли ROI';
                                formatFn = (p: any) => `*${p.stats.roi.toFixed(2)}%*`;
                        }

                        let leaderboardText = `${title} (${l_period})\n\n`;
                        const top10 = sortedBoard.slice(0, 10);
                        if(top10.length === 0) {
                            leaderboardText += "_Нет данных для этого периода._";
                        } else {
                            top10.forEach((p, index) => {
                                const icons = ['🥇', '🥈', '🥉'];
                                const prefix = index < 3 ? icons[index] : `${index + 1}.`;
                                const isCurrentUser = p.user.email === userEmail ? " (Вы)" : "";
                                leaderboardText += `${prefix} ${p.user.nickname}${isCurrentUser} - ${formatFn(p)}\n`;
                            });
                        }

                        await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, leaderboardText, getLeaderboardPeriodMenu(l_type));
                    }
                    return new Response('OK');
                
                case 'show_challenges':
                     if (messageId) {
                        await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "⏳ Считаю лидеров челленджей...");
                        const allUsersData = await getAllUsersData(env.BOT_STATE);
                        const periodStartDate = getPeriodStart('week');
                        
                        const participants = allUsersData.map(user => {
                            const periodBets = user.bets.filter(b => new Date(b.createdAt) >= periodStartDate);
                            const settledBets = periodBets.filter(b => b.status !== BetStatus.Pending && b.status !== BetStatus.Void);
                            const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
                            const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
                            const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
                            const wins = settledBets.filter(b => b.status === BetStatus.Won);
                            return {
                                nickname: user.nickname,
                                totalBets: settledBets.length,
                                biggestWin: wins.length > 0 ? Math.max(...wins.map(b => b.profit ?? 0)) : 0,
                                roi,
                            };
                        });
                        
                        const biggestWinLeader = [...participants].sort((a,b) => b.biggestWin - a.biggestWin)[0];
                        const roiLeader = [...participants].filter(p => p.totalBets >= 10).sort((a,b) => b.roi - a.roi)[0];

                        let challengesText = `🎯 *Еженедельные челленджи*\n\n`;
                        challengesText += `*${WEEKLY_CHALLENGES[0].title}*\n`;
                        if (biggestWinLeader && biggestWinLeader.biggestWin > 0) {
                            challengesText += `🥇 ${biggestWinLeader.nickname} - *${biggestWinLeader.biggestWin.toFixed(2)} ₽*\n\n`;
                        } else {
                             challengesText += `_Пока нет лидера._\n\n`;
                        }

                        challengesText += `*${WEEKLY_CHALLENGES[1].title}*\n`;
                        if (roiLeader && roiLeader.roi > 0) {
                            challengesText += `🥇 ${roiLeader.nickname} - *${roiLeader.roi.toFixed(2)}%*\n\n`;
                        } else {
                             challengesText += `_Пока нет лидера (нужно мин. 10 ставок)._\n\n`;
                        }
                        
                        await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, challengesText, { inline_keyboard: [[{ text: "⬅️ К соревнованиям", callback_data: "competition_menu" }]] });
                     }
                     return new Response('OK');
            }
        }
        
        const dialogState = await getDialogState(env.BOT_STATE, userId);
        if (text && dialogState) {
            const userData = userEmail ? await getUserData(env.BOT_STATE, userEmail) : null;
            
            if (dialogState.action === 'add_bet') {
                 if (!userData || !userEmail) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Ошибка сессии. Пожалуйста, /start"); return new Response('OK'); }
                 if(messageId) await deleteMessage(env.TELEGRAM_BOT_TOKEN, chatId, messageId);

                 const step = dialogState.data.step;
                 const botMessageId = dialogState.data.botMessageId;

                 switch(step) {
                    case 2:
                        const teams = text.split('-').map(t => t.trim());
                        if (teams.length !== 2 || !teams[0] || !teams[1]) {
                             await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Неверный формат. Пожалуйста, используйте `Команда 1 - Команда 2`.");
                             return new Response('OK');
                        }
                        dialogState.data.homeTeam = teams[0];
                        dialogState.data.awayTeam = teams[1];
                        dialogState.data.step = 3;
                        await setDialogState(env.BOT_STATE, userId, dialogState);
                        if(botMessageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, botMessageId, "📝 *Новая ставка (Шаг 3/5)*\n\nВыберите исход:", createMarketKeyboard(dialogState.data.sport));
                        break;
                    case 4:
                        const stake = parseFloat(text);
                        if (isNaN(stake) || stake <= 0) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Неверная сумма. Введите положительное число."); return new Response('OK'); }
                        dialogState.data.stake = stake;
                        dialogState.data.step = 5;
                        await setDialogState(env.BOT_STATE, userId, dialogState);
                        if(botMessageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, botMessageId, "📝 *Новая ставка (Шаг 5/5)*\n\nВведите коэффициент.", { inline_keyboard: [[{ text: "↩️ Изменить сумму", callback_data: "add_bet_step:4" }]] });
                        break;
                    case 5:
                        const odds = parseFloat(text);
                        if (isNaN(odds) || odds <= 1) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Неверный коэффициент. Введите число больше 1."); return new Response('OK'); }
                        dialogState.data.odds = odds;
                        dialogState.data.step = 6;
                        await setDialogState(env.BOT_STATE, userId, dialogState);
                        const confirmText = `🔍 *Проверьте данные ставки:*\n\n` + `*Спорт:* ${dialogState.data.sport}\n` + `*Событие:* ${dialogState.data.homeTeam} - ${dialogState.data.awayTeam}\n` + `*Исход:* ${dialogState.data.market}\n` + `*Сумма:* ${dialogState.data.stake} ₽\n` + `*Коэффициент:* ${dialogState.data.odds}\n\n` + `Все верно?`;
                        if (botMessageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, botMessageId, confirmText, { inline_keyboard: [[{ text: "✅ Сохранить", callback_data: "add_bet_save" }, { text: "✏️ Начать заново", callback_data: "add_bet_step:1" }]] });
                        break;
                 }
                 return new Response('OK');
            }

            switch(dialogState.action) {
                case 'ai_chat_active':
                    if (!userEmail || !userData) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Ошибка сессии. Пожалуйста, /start"); return new Response('OK'); }
                    const thinkingMsgResponse = await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "🤖 Думаю...");
                    const thinkingMsgId = thinkingMsgResponse?.result?.message_id;
                    const history = (dialogState.data.history || []) as Message[];
                    history.push({ role: 'user', text: text });
                    const analytics = calculateAnalytics(userData.bets, userData.bankroll, userData.bankHistory);
                    const currentDate = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
                    const systemInstruction = generalSystemInstruction(currentDate);
                    const contents = history.map(msg => ({ role: msg.role, parts: [{ text: msg.text }] }));
                    if (history.length === 1 && (text.toLowerCase().includes('эффективность') || text.toLowerCase().includes('статистику'))) {
                        contents[0].parts[0].text = `${analyticsToText(analytics)}\n\n${text}`;
                    }
                    try {
                        const result = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: contents, config: { systemInstruction }, tools: [{googleSearch: {}}] });
                        const aiResponseText = result.text;
                        history.push({ role: 'model', text: aiResponseText });
                        await setDialogState(env.BOT_STATE, userId, { action: 'ai_chat_active', data: { history } });
                        if(thinkingMsgId) { await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, thinkingMsgId, aiResponseText, { inline_keyboard: [[{ text: "⬅️ Выйти из чата", callback_data: "main_menu" }]] }); }
                        else { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponseText, { inline_keyboard: [[{ text: "⬅️ Выйти из чата", callback_data: "main_menu" }]] }); }
                    } catch (e) {
                        console.error("Gemini call from bot failed:", e);
                        const errorText = "Произошла ошибка при обращении к AI. Попробуйте снова.";
                        if (thinkingMsgId) { await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, thinkingMsgId, errorText, { inline_keyboard: [[{ text: "⬅️ Выйти из чата", callback_data: "main_menu" }]] }); }
                        else { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorText, { inline_keyboard: [[{ text: "⬅️ Выйти из чата", callback_data: "main_menu" }]] }); }
                    }
                    return new Response('OK');

                case 'link_ask_code':
                    const code = text.match(/\d{6}/)?.[0];
                    if (!code) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Это не похоже на 6-значный код. Попробуйте еще раз."); return new Response('OK'); }
                    const userDataString = await env.BOT_STATE.get(`tgauth:${code}`);
                    if (userDataString) {
                        const fullUserData = JSON.parse(userDataString) as UserData;
                        await env.BOT_STATE.put(`telegram:${userId}`, fullUserData.email);
                        await saveUserData(env.BOT_STATE, fullUserData.email, fullUserData);
                        await env.BOT_STATE.delete(`tgauth:${code}`);
                        await setDialogState(env.BOT_STATE, userId, null);
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Аккаунт для ${fullUserData.email} успешно привязан!`, getMainMenu(true));
                    } else {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый на сайте.");
                    }
                    return new Response('OK');
                
                case 'ask_deposit_amount':
                case 'ask_withdraw_amount':
                    if (!userData || !userEmail) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Ошибка сессии. Пожалуйста, /start"); return new Response('OK'); }
                    const amount = parseFloat(text);
                    const isDeposit = dialogState.action === 'ask_deposit_amount';
                    if (isNaN(amount) || amount <= 0) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Неверная сумма. Пожалуйста, введите положительное число.", { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "bank_management" }]] }); return new Response('OK'); }
                    if (!isDeposit && amount > userData.bankroll) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Сумма снятия не может превышать текущий банк.", { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "bank_management" }]] }); return new Response('OK'); }
                    const finalAmount = isDeposit ? amount : -amount;
                    const transaction: BankTransaction = { id: new Date().toISOString() + Math.random(), timestamp: new Date().toISOString(), type: isDeposit ? BankTransactionType.Deposit : BankTransactionType.Withdrawal, amount: finalAmount, previousBalance: userData.bankroll, newBalance: userData.bankroll + finalAmount, description: isDeposit ? 'Ручное пополнение (Telegram)' : 'Вывод средств (Telegram)' };
                    userData.bankroll += finalAmount;
                    userData.bankHistory.unshift(transaction);
                    await saveUserData(env.BOT_STATE, userEmail, userData);
                    await setDialogState(env.BOT_STATE, userId, null);
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Банк обновлен. Новый баланс: *${userData.bankroll.toFixed(2)} ₽*`, getMainMenu(true));
                    return new Response('OK');
                
                case 'register_ask_email':
                    const email = text.toLowerCase();
                    if (!/^\S+@\S+\.\S+$/.test(email)) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Неверный формат email. Попробуйте снова.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] }); return new Response('OK'); }
                    const existingUser = await getUserData(env.BOT_STATE, email);
                    if (existingUser) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Этот email уже зарегистрирован. Попробуйте другой или привяжите существующий аккаунт.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] }); return new Response('OK'); }
                    await setDialogState(env.BOT_STATE, userId, { action: 'register_ask_nickname', data: { email } });
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Отлично! Теперь придумайте никнейм (мин. 3 символа).");
                    return new Response('OK');

                case 'register_ask_nickname':
                    const nickname = text;
                    if (nickname.length < 3) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Никнейм должен быть не менее 3 символов. Попробуйте снова.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] }); return new Response('OK'); }
                    const existingNickname = await getEmailByNickname(env.BOT_STATE, nickname);
                    if (existingNickname) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Этот никнейм уже занят. Попробуйте другой.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] }); return new Response('OK'); }
                    await setDialogState(env.BOT_STATE, userId, { action: 'register_ask_password', data: { ...dialogState.data, nickname } });
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Придумайте пароль (мин. 6 символов).\n\n⚠️ *ВНИМАНИЕ: Не используйте важные пароли!* После отправки, пожалуйста, удалите сообщение с паролем из чата.");
                    return new Response('OK');
                
                case 'register_ask_password':
                    const password = text;
                    if (password.length < 6) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Пароль должен быть не менее 6 символов. Попробуйте снова.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] }); return new Response('OK'); }
                    const { email: regEmail, nickname: regNickname } = dialogState.data;
                    const newUser: UserData = {
                        email: regEmail, nickname: regNickname, password_hash: mockHash(password), registeredAt: new Date().toISOString(),
                        referralCode: `${regNickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                        buttercups: 0, status: 'active', bankroll: 10000, bets: [],
                        bankHistory: [{ id: new Date().toISOString() + Math.random(), timestamp: new Date().toISOString(), type: BankTransactionType.Deposit, amount: 10000, previousBalance: 0, newBalance: 10000, description: 'Начальный банк' }],
                        goals: [],
                    };
                    await saveUserData(env.BOT_STATE, regEmail, newUser);
                    await saveNicknameMapping(env.BOT_STATE, regNickname, regEmail);
                    const userListJson = await env.BOT_STATE.get('user_list');
                    const userList = userListJson ? JSON.parse(userListJson) : [];
                    if (!userList.includes(regEmail)) {
                        userList.push(regEmail);
                        await env.BOT_STATE.put('user_list', JSON.stringify(userList));
                    }
                    await env.BOT_STATE.put(`telegram:${userId}`, regEmail);
                    await setDialogState(env.BOT_STATE, userId, null);
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `🎉 *Регистрация завершена!* \n\nВаш аккаунт для *${regEmail}* создан и привязан к этому чату.\n\nМожете удалить сообщения с вашими данными для безопасности.`, getMainMenu(true));
                    return new Response('OK');
            }
        }

        if (text && !userEmail && !dialogState) {
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Я не понимаю команду. Пожалуйста, используйте кнопки ниже или введите /start.");
            await sendNewUserWelcome(env.TELEGRAM_BOT_TOKEN, chatId);
        }

    } catch (error) {
        console.error("Webhook Error:", error);
        const bodyText = await requestClone.text();
        console.error("Failed request body:", bodyText);
        try {
            const updateForError = JSON.parse(bodyText);
            const chatId = updateForError.message?.chat.id || updateForError.callback_query?.message?.chat.id;
             if (chatId) { await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Произошла критическая ошибка на сервере. Я уже сообщил разработчикам.`); }
        } catch {}
    }
    
    return new Response('OK');
};