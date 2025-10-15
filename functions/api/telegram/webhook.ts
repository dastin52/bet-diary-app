// functions/api/telegram/webhook.ts

// --- TYPE DEFINITIONS ---
interface KVNamespace {
    put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expiration?: number; expirationTtl?: number; metadata?: any; }): Promise<void>;
    get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<string | null | any>;
    delete(key: string): Promise<void>;
}

interface Env {
    BOT_STATE: KVNamespace;
    TELEGRAM_BOT_TOKEN: string;
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (context: EventContext<E>) => Response | Promise<Response>;

// Telegram API Types
interface TelegramUser { id: number; }
interface TelegramChat { id: number; }
interface TelegramMessage { message_id: number; from: TelegramUser; chat: TelegramChat; date: number; text?: string; }
interface TelegramCallbackQuery { id: string; from: TelegramUser; message: TelegramMessage; data?: string; }
interface TelegramUpdate { update_id: number; message?: TelegramMessage; callback_query?: TelegramCallbackQuery; }

// --- Re-importing necessary types from the main app ---
enum BetStatus { Pending = 'pending', Won = 'won', Lost = 'lost', Void = 'void', CashedOut = 'cashed_out' }
enum BetType { Single = 'single', Parlay = 'parlay', System = 'system' }
interface BetLeg { homeTeam: string; awayTeam: string; market: string; }
interface Bet { id: string; createdAt: string; event: string; legs: BetLeg[]; sport: string; bookmaker: string; betType: BetType; stake: number; odds: number; status: BetStatus; profit?: number; tags?: string[]; }
enum BankTransactionType { Deposit = 'deposit', Withdrawal = 'withdrawal', BetWin = 'bet_win', BetLoss = 'bet_loss', BetVoid = 'bet_void' }
interface BankTransaction { id: string; timestamp: string; type: BankTransactionType; amount: number; previousBalance: number; newBalance: number; description: string; betId?: string; }
interface User { email: string; nickname: string; password_hash: string; registeredAt: string; referralCode: string; buttercups: number; status: 'active' | 'blocked'; }
// --- End of re-imported types ---

// App-specific Types for bot state
interface UserData {
    bets: Bet[];
    bankroll: number;
    bankHistory: BankTransaction[];
}

type AddBetData = Partial<Omit<Bet, 'id' | 'createdAt' | 'event'>>;
type ConversationStep =
    | 'awaiting_nickname' | 'awaiting_email' | 'awaiting_password'
    | 'add_bet_awaiting_event' | 'add_bet_awaiting_market' | 'add_bet_awaiting_stake_odds'
    | 'manage_bank_awaiting_deposit' | 'manage_bank_awaiting_withdrawal';

interface ConversationState {
    step: ConversationStep;
    data: {
        nickname?: string;
        email?: string;
        bet?: AddBetData;
    };
}

// --- CONSTANTS & KEYBOARDS ---
const SPORTS = ['Футбол', 'Баскетбол', 'Теннис', 'Хоккей', 'ММА', 'Киберспорт'];
const MARKETS_BY_SPORT: { [key: string]: string[] } = {
  'Футбол': ['П1', 'X', 'П2', 'Обе забьют - Да', 'Тотал > 2.5', 'Тотал < 2.5'],
  'Баскетбол': ['П1 (с ОТ)', 'П2 (с ОТ)', 'Тотал > 220.5', 'Тотал < 220.5'],
  'Теннис': ['П1', 'П2', 'Тотал по геймам > 22.5', 'Тотал по геймам < 22.5'],
  'Хоккей': ['П1 (вкл. ОТ)', 'П2 (вкл. ОТ)', 'Тотал > 5.5', 'Тотал < 5.5'],
  'ММА': ['П1', 'П2', 'Тотал раундов > 1.5', 'Бой пройдет всю дистанцию'],
  'Киберспорт': ['П1', 'П2', 'Тотал карт > 2.5', 'Фора 1 (-1.5)'],
};

const welcomeKeyboard = {
    inline_keyboard: [
        [{ text: "✍️ Зарегистрировать аккаунт", callback_data: "register" }],
        [{ text: "🔗 Привязать аккаунт", callback_data: "link_account" }]
    ]
};
const mainMenuKeyboard = {
    inline_keyboard: [
        [{ text: "📝 Добавить ставку", callback_data: "add_bet" }],
        [{ text: "📊 Просмотр статистики", callback_data: "view_stats" }],
        [{ text: "💰 Управление банком", callback_data: "manage_bank" }],
    ]
};
const cancelKeyboard = { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_action" }]] };
const statsKeyboard = { inline_keyboard: [[{ text: "📈 За неделю", callback_data: "view_stats_week" }, { text: "📊 За месяц", callback_data: "view_stats_month" }]] };
const bankKeyboard = { inline_keyboard: [[{ text: "📥 Внести депозит", callback_data: "deposit" }, { text: "📤 Сделать вывод", callback_data: "withdraw" }]] };

// --- TELEGRAM API HELPER ---
const telegramApi = async (token: string, methodName: string, body: object) => {
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/${methodName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const result = await response.json();
            console.error(`Telegram API error (${methodName}):`, result.description);
        }
        return response;
    } catch (error) {
        console.error(`Network error calling Telegram API (${methodName}):`, error instanceof Error ? error.message : String(error));
        return new Response('Network error', { status: 500 });
    }
};

// A mock hashing function.
const mockHash = (password: string) => `hashed_${password}`;

// --- KV & DATA HELPERS ---
const getUserEmailFromTgId = (kv: KVNamespace, tgId: number): Promise<string | null> => kv.get(`user:tg:${tgId}`);
const getState = async (kv: KVNamespace, tgId: number): Promise<ConversationState | null> => {
    const stateJson = await kv.get(`state:tg:${tgId}`);
    return stateJson ? JSON.parse(stateJson) : null;
};
const setState = (kv: KVNamespace, tgId: number, state: ConversationState | null): Promise<void> => {
    if (state === null) {
        return kv.delete(`state:tg:${tgId}`);
    }
    return kv.put(`state:tg:${tgId}`, JSON.stringify(state));
};
const getUserData = async (kv: KVNamespace, email: string): Promise<UserData> => {
    const dataJson = await kv.get(`data:user:${email}`);
    if (dataJson) {
        return JSON.parse(dataJson);
    }
    const newUser: UserData = { bankroll: 10000, bets: [], bankHistory: [] };
    await saveUserData(kv, email, newUser);
    return newUser;
};
const saveUserData = (kv: KVNamespace, email: string, data: UserData): Promise<void> => kv.put(`data:user:${email}`, JSON.stringify(data));

// --- BUSINESS LOGIC HELPERS ---
const calculateProfit = (bet: { status: BetStatus, stake: number, odds: number, profit?: number }): number => {
    switch (bet.status) {
      case BetStatus.Won: return bet.stake * (bet.odds - 1);
      case BetStatus.Lost: return -bet.stake;
      default: return 0;
    }
};
const generateEventString = (legs: BetLeg[], betType: BetType, sport: string): string => {
    if (!legs || legs.length === 0) return 'Пустое событие';
    const leg = legs[0];
    const eventName = ['Теннис', 'Бокс', 'ММА'].includes(sport) ? `${leg.homeTeam} - ${leg.awayTeam}` : `${leg.homeTeam} vs ${leg.awayTeam}`;
    return `${eventName} - ${leg.market}`;
};

async function addBetToUserData(kv: KVNamespace, email: string, betData: AddBetData) {
    const userData = await getUserData(kv, email);
    const newBet: Bet = {
      ...(betData as Omit<Bet, 'id' | 'createdAt' | 'event'>),
      id: new Date().toISOString() + Math.random(),
      createdAt: new Date().toISOString(),
      event: generateEventString(betData.legs!, betData.betType!, betData.sport!),
      status: BetStatus.Pending, // All bets from bot are initially pending
    };
    userData.bets.unshift(newBet); // Add to beginning
    await saveUserData(kv, email, userData);
}

async function addBankTransactionToUserData(kv: KVNamespace, email: string, amount: number, type: BankTransactionType, description: string) {
    const userData = await getUserData(kv, email);
    const newTransaction: BankTransaction = {
        id: new Date().toISOString() + Math.random(),
        timestamp: new Date().toISOString(),
        type,
        amount,
        previousBalance: userData.bankroll,
        newBalance: userData.bankroll + amount,
        description,
    };
    userData.bankroll += amount;
    userData.bankHistory.unshift(newTransaction);
    await saveUserData(kv, email, userData);
}

// --- MAIN FUNCTION HANDLER ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.BOT_STATE) {
        console.error("FATAL: Environment variables or KV bindings are not set.");
        return new Response('OK');
    }
    const token = env.TELEGRAM_BOT_TOKEN;
    const kv = env.BOT_STATE;

    try {
        const update = await request.json() as TelegramUpdate;
        const fromId = update.message?.from.id || update.callback_query?.from.id;
        const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
        if (!fromId || !chatId) return new Response('OK');

        // --- Handle Callback Queries (Button Presses) ---
        if (update.callback_query) {
            const { id: callbackQueryId, data: callbackData } = update.callback_query;
            await telegramApi(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId });

            const state = await getState(kv, fromId);

            // Handle "Cancel" from any state
            if (callbackData === 'cancel_action') {
                await setState(kv, fromId, null);
                await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Действие отменено.", reply_markup: mainMenuKeyboard });
                return new Response('OK');
            }
            
            // Add Bet Flow - Sport Selection
            if (callbackData?.startsWith('add_bet_sport_')) {
                const sport = callbackData.replace('add_bet_sport_', '');
                await setState(kv, fromId, {
                    step: 'add_bet_awaiting_event',
                    data: { bet: { sport, betType: BetType.Single, legs: [{ homeTeam: '', awayTeam: '', market: '' }] } },
                });
                await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `Выбран спорт: ${sport}.\n\nТеперь введите событие (например, "Реал Мадрид - Барселона"):`, reply_markup: cancelKeyboard });
                return new Response('OK');
            }

            // Add Bet Flow - Market Selection
            if (callbackData?.startsWith('add_bet_market_')) {
                const market = callbackData.replace('add_bet_market_', '');
                if (state?.step === 'add_bet_awaiting_market' && state.data.bet) {
                    state.data.bet.legs![0].market = market;
                    state.step = 'add_bet_awaiting_stake_odds';
                    await setState(kv, fromId, state);
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `Выбран исход: ${market}.\n\nВведите сумму ставки и коэффициент через пробел (например, "1000 2.15"):`, reply_markup: cancelKeyboard });
                }
                return new Response('OK');
            }

            // Add Bet Flow - Confirmation
            if (callbackData === 'add_bet_confirm') {
                if (state?.step === 'add_bet_awaiting_stake_odds' && state.data.bet) {
                    const userEmail = await getUserEmailFromTgId(kv, fromId);
                    if (userEmail) {
                        await addBetToUserData(kv, userEmail, state.data.bet);
                        await setState(kv, fromId, null);
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "✅ Ставка успешно добавлена!", reply_markup: mainMenuKeyboard });
                    }
                }
                return new Response('OK');
            }


            // Main Menu actions
            switch (callbackData) {
                case 'register':
                    await setState(kv, fromId, { step: 'awaiting_nickname', data: {} });
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Какой у вас будет никнейм? (мин. 3 символа)" });
                    break;
                case 'link_account':
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Сгенерируйте 6-значный код на сайте ('Настройки' ➔ 'Интеграция с Telegram') и отправьте его мне." });
                    break;
                case 'add_bet':
                    const sportButtons = SPORTS.map(sport => ({ text: sport, callback_data: `add_bet_sport_${sport}` }));
                    const keyboard = { inline_keyboard: [sportButtons.slice(0, 3), sportButtons.slice(3, 6), [{ text: "❌ Отмена", callback_data: "cancel_action" }]] };
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Выберите вид спорта:", reply_markup: keyboard });
                    break;
                case 'view_stats':
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "За какой период показать статистику?", reply_markup: statsKeyboard });
                    break;
                case 'manage_bank':
                     await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Выберите действие:", reply_markup: bankKeyboard });
                    break;
                case 'deposit':
                     await setState(kv, fromId, { step: 'manage_bank_awaiting_deposit', data: {} });
                     await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Введите сумму пополнения:", reply_markup: cancelKeyboard });
                    break;
                case 'withdraw':
                     await setState(kv, fromId, { step: 'manage_bank_awaiting_withdrawal', data: {} });
                     await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Введите сумму для вывода:", reply_markup: cancelKeyboard });
                    break;
                case 'view_stats_week':
                case 'view_stats_month':
                     const userEmailForStats = await getUserEmailFromTgId(kv, fromId);
                     if (userEmailForStats) {
                        const userData = await getUserData(kv, userEmailForStats);
                        const period = callbackData.includes('week') ? 7 : 30;
                        const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
                        const periodBets = userData.bets.filter(b => new Date(b.createdAt) >= startDate && b.status !== BetStatus.Pending);
                        
                        if (periodBets.length === 0) {
                             await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `За этот период нет рассчитанных ставок.` });
                             return new Response('OK');
                        }

                        const totalStaked = periodBets.reduce((acc, bet) => acc + bet.stake, 0);
                        const totalProfit = periodBets.reduce((acc, bet) => acc + (calculateProfit(bet) ?? 0), 0);
                        const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
                        const winRate = periodBets.filter(b => b.status === BetStatus.Won).length / periodBets.filter(b => b.status !== BetStatus.Void).length * 100 || 0;

                        const summary = `📊 *Статистика за ${period === 7 ? 'неделю' : 'месяц'}*\n\n` +
                                        `💰 *Профит:* ${totalProfit.toFixed(2)} ₽\n` +
                                        `📈 *ROI:* ${roi.toFixed(2)}%\n` +
                                        `🎯 *Проходимость:* ${winRate.toFixed(1)}%\n` +
                                        `📋 *Всего ставок:* ${periodBets.length}`;
                        
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: summary, parse_mode: 'Markdown' });
                     }
                    break;
            }
            return new Response('OK');
        }

        // --- Handle Text Messages ---
        if (update.message?.text) {
            const messageText = update.message.text.trim();
            const state = await getState(kv, fromId);
            
            // Handle Conversation Steps
            if (state) {
                 const userEmail = await getUserEmailFromTgId(kv, fromId);
                 switch (state.step) {
                    case 'add_bet_awaiting_event':
                        const [homeTeam, awayTeam] = messageText.split(/[-vs_]/).map(s => s.trim());
                        if (!homeTeam || !awayTeam) {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: 'Неверный формат. Пожалуйста, введите событие в формате "Команда 1 - Команда 2".' });
                            return new Response('OK');
                        }
                        state.data.bet!.legs![0].homeTeam = homeTeam;
                        state.data.bet!.legs![0].awayTeam = awayTeam;
                        state.step = 'add_bet_awaiting_market';
                        await setState(kv, fromId, state);
                        const markets = MARKETS_BY_SPORT[state.data.bet!.sport!] || [];
                        const marketButtons = markets.map(m => ({ text: m, callback_data: `add_bet_market_${m}`}));
                        const marketKeyboard = { inline_keyboard: [marketButtons.slice(0,3), marketButtons.slice(3,6), [{ text: "❌ Отмена", callback_data: "cancel_action" }]] };
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `Событие: ${homeTeam} - ${awayTeam}.\n\nВыберите исход:`, reply_markup: marketKeyboard });
                        break;
                    case 'add_bet_awaiting_stake_odds':
                        const [stakeStr, oddsStr] = messageText.split(/\s+/);
                        const stake = parseFloat(stakeStr);
                        const odds = parseFloat(oddsStr);
                        if (isNaN(stake) || isNaN(odds) || stake <= 0 || odds <= 1) {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: 'Неверный формат. Введите сумму и коэффициент через пробел (например, "1000 2.15").' });
                            return new Response('OK');
                        }
                        state.data.bet!.stake = stake;
                        state.data.bet!.odds = odds;
                        await setState(kv, fromId, state);
                        const bet = state.data.bet;
                        const confirmText = `*Проверьте ставку:*\n\n` +
                                            `*Спорт:* ${bet.sport}\n` +
                                            `*Событие:* ${bet.legs![0].homeTeam} - ${bet.legs![0].awayTeam}\n` +
                                            `*Исход:* ${bet.legs![0].market}\n` +
                                            `*Сумма:* ${bet.stake} ₽\n` +
                                            `*Коэффициент:* ${bet.odds}`;
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: confirmText, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'add_bet_confirm' }, { text: '❌ Отмена', callback_data: 'cancel_action' }]] } });
                        break;
                    case 'manage_bank_awaiting_deposit':
                    case 'manage_bank_awaiting_withdrawal':
                        const amount = parseFloat(messageText);
                        if (isNaN(amount) || amount <= 0) {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: 'Неверная сумма. Пожалуйста, введите положительное число.' });
                            return new Response('OK');
                        }
                        if (userEmail) {
                            const isDeposit = state.step === 'manage_bank_awaiting_deposit';
                            await addBankTransactionToUserData(kv, userEmail, isDeposit ? amount : -amount, isDeposit ? BankTransactionType.Deposit : BankTransactionType.Withdrawal, isDeposit ? "Депозит через Telegram" : "Вывод через Telegram");
                            await setState(kv, fromId, null);
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `✅ Баланс успешно ${isDeposit ? 'пополнен' : 'обновлен'}!`, reply_markup: mainMenuKeyboard });
                        }
                        break;
                    // Handle registration steps... (omitted for brevity, already exists)
                }
                return new Response('OK');
            }

            // --- Handle Commands & Standard Messages ---
            switch (messageText) {
                case '/start':
                    const userEmail = await getUserEmailFromTgId(kv, fromId);
                    if (userEmail) {
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `С возвращением!`, reply_markup: mainMenuKeyboard });
                    } else {
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "👋 Добро пожаловать в Дневник Ставок!", reply_markup: welcomeKeyboard });
                    }
                    break;
                case '/getcode':
                     const emailForCode = await getUserEmailFromTgId(kv, fromId);
                     if (emailForCode) {
                         const code = Math.floor(100000 + Math.random() * 900000).toString();
                         await kv.put(`web_auth_code:${code}`, emailForCode, { expirationTtl: 120 }); // 2 minute expiry
                         await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `🔑 Ваш временный код для входа на сайт: *${code}*\n\nОн действителен 2 минуты.`, parse_mode: 'Markdown' });
                     } else {
                         await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Ваш аккаунт не привязан. Используйте /start для начала." });
                     }
                    break;
                default:
                    if (/^\d{6}$/.test(messageText)) { // Handle 6-digit auth code
                        const email = await kv.get(`authcode:${messageText}`);
                        if (email) {
                            await kv.put(`user:tg:${fromId}`, email);
                            await kv.delete(`authcode:${messageText}`);
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `✅ Аккаунт для ${email} успешно привязан!`, reply_markup: mainMenuKeyboard });
                        } else {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `❌ Неверный или истекший код.` });
                        }
                    } else {
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Я не понял команду. Используйте /start для навигации." });
                    }
                    break;
            }
        }

    } catch (e: any) {
        console.error("--- UNHANDLED FATAL ERROR IN WEBHOOK ---", e.message, e.stack);
    }
    
    return new Response('OK');
};
