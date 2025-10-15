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

// FIX: Define missing Goal and UserData types to resolve compilation errors.
enum GoalMetric { Profit = 'profit', ROI = 'roi', WinRate = 'win_rate', BetCount = 'bet_count' }
enum GoalStatus { InProgress = 'in_progress', Achieved = 'achieved', Failed = 'failed' }
interface Goal { id: string; title: string; metric: GoalMetric; targetValue: number; currentValue: number; status: GoalStatus; createdAt: string; deadline: string; scope: { type: 'sport' | 'betType' | 'tag' | 'all'; value?: string; }; }

// This structure holds all data for a user, which is stored as a single JSON blob in KV.
interface UserData {
    bets: Bet[];
    bankroll: number;
    goals: Goal[];
    bankHistory: BankTransaction[];
}
// --- End of re-imported types ---

// App-specific Types for bot state
type AddBetData = Partial<Omit<Bet, 'id' | 'createdAt' | 'event'>>;
type ConversationStep =
    | 'awaiting_nickname' | 'awaiting_email' | 'awaiting_password'
    | 'add_bet_awaiting_event' | 'add_bet_awaiting_market' | 'add_bet_awaiting_stake_odds' | 'add_bet_awaiting_status'
    | 'update_bet_awaiting_status'
    | 'manage_bank_awaiting_deposit' | 'manage_bank_awaiting_withdrawal';

interface ConversationState {
    step: ConversationStep;
    data: {
        nickname?: string;
        email?: string;
        bet?: AddBetData;
        betId?: string; // For updating status
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
        [{ text: "📈 Управление ставками", callback_data: "manage_bets" }],
        [{ text: "📊 Просмотр статистики", callback_data: "view_stats" }],
        [{ text: "💰 Управление банком", callback_data: "manage_bank" }],
    ]
};
const betManagementKeyboard = {
    inline_keyboard: [
        [{ text: "🔄 Изменить статус ставки", callback_data: "update_bet_status_select" }],
        [{ text: "⬅️ Назад в меню", callback_data: "main_menu" }],
    ]
};
const cancelKeyboard = { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_action" }]] };
const statsKeyboard = { inline_keyboard: [[{ text: "📈 За неделю", callback_data: "view_stats_week" }, { text: "📊 За месяц", callback_data: "view_stats_month" }]] };
const bankKeyboard = { inline_keyboard: [[{ text: "📥 Внести депозит", callback_data: "deposit" }, { text: "📤 Сделать вывод", callback_data: "withdraw" }]] };
const addBetStatusKeyboard = {
    inline_keyboard: [
        [{ text: "⏳ В ожидании", callback_data: `add_bet_set_status:${BetStatus.Pending}` }],
        [{ text: "✅ Выигрыш", callback_data: `add_bet_set_status:${BetStatus.Won}` }, { text: "❌ Проигрыш", callback_data: `add_bet_set_status:${BetStatus.Lost}` }],
        [{ text: "↩️ Возврат", callback_data: `add_bet_set_status:${BetStatus.Void}` }],
    ]
};

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
    return kv.put(`state:tg:${tgId}`, JSON.stringify(state), { expirationTtl: 900 }); // State expires in 15 mins
};
const getUserData = async (kv: KVNamespace, email: string): Promise<UserData> => {
    const dataJson = await kv.get(`data:user:${email}`);
    if (dataJson) {
        return JSON.parse(dataJson);
    }
    // FIX: Add `goals` to the initial user data object to match the UserData type.
    const newUser: UserData = { bankroll: 10000, bets: [], goals: [], bankHistory: [] };
    await saveUserData(kv, email, newUser);
    return newUser;
};
const saveUserData = (kv: KVNamespace, email: string, data: UserData): Promise<void> => kv.put(`data:user:${email}`, JSON.stringify(data));

// --- BUSINESS LOGIC HELPERS ---
const calculateProfit = (bet: { status: BetStatus, stake: number, odds: number, profit?: number }): number => {
    switch (bet.status) {
      case BetStatus.Won: return bet.stake * (bet.odds - 1);
      case BetStatus.Lost: return -bet.stake;
      case BetStatus.Void: return 0;
      default: return 0;
    }
};
const generateEventString = (legs: BetLeg[], betType: BetType, sport: string): string => {
    if (!legs || legs.length === 0) return 'Пустое событие';
    if (betType === BetType.Parlay) return `Экспресс (${legs.length} событий)`;
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
    };
    
    if (newBet.status !== BetStatus.Pending) {
        newBet.profit = calculateProfit(newBet);
        if(newBet.profit !== 0) {
            const type = newBet.profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
            await addBankTransactionToUserData(kv, email, newBet.profit, type, `Ставка: ${newBet.event}`, userData);
        }
    } else {
        userData.bets.unshift(newBet); // Add to beginning
        await saveUserData(kv, email, userData);
    }
}

async function addBankTransactionToUserData(kv: KVNamespace, email: string, amount: number, type: BankTransactionType, description: string, existingUserData?: UserData) {
    const userData = existingUserData || await getUserData(kv, email);
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
    const requestClone = request.clone();
    if (!env.TELEGRAM_BOT_TOKEN || !env.BOT_STATE) {
        console.error("FATAL: Environment variables or KV bindings are not set.");
        return new Response('OK');
    }
    const token = env.TELEGRAM_BOT_TOKEN;
    const kv = env.BOT_STATE;

    try {
        const update = await request.json() as TelegramUpdate;
        console.log("Received update:", update.update_id);
        const fromId = update.message?.from.id || update.callback_query?.from.id;
        const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
        if (!fromId || !chatId) return new Response('OK');

        // --- Handle Callback Queries (Button Presses) ---
        if (update.callback_query) {
            const { id: callbackQueryId, data: callbackData } = update.callback_query;
            await telegramApi(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId });

            const state = await getState(kv, fromId);

            if (callbackData === 'cancel_action') {
                await setState(kv, fromId, null);
                await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Действие отменено.", reply_markup: mainMenuKeyboard });
                return new Response('OK');
            }
            if (callbackData === 'main_menu') {
                await setState(kv, fromId, null);
                await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Главное меню:", reply_markup: mainMenuKeyboard });
                return new Response('OK');
            }
            
            // Add Bet Flow
            if (callbackData?.startsWith('add_bet_sport_')) {
                const sport = callbackData.replace('add_bet_sport_', '');
                await setState(kv, fromId, { step: 'add_bet_awaiting_event', data: { bet: { sport, betType: BetType.Single, legs: [{ homeTeam: '', awayTeam: '', market: '' }] } } });
                await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `Выбран спорт: ${sport}.\n\nВведите событие (например, "Реал Мадрид - Барселона"):`, reply_markup: cancelKeyboard });
                return new Response('OK');
            }
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
            if (callbackData?.startsWith('add_bet_set_status:')) {
                const status = callbackData.replace('add_bet_set_status:', '') as BetStatus;
                if (state?.step === 'add_bet_awaiting_status' && state.data.bet) {
                    state.data.bet.status = status;
                    const userEmail = await getUserEmailFromTgId(kv, fromId);
                    if (userEmail) {
                        await addBetToUserData(kv, userEmail, state.data.bet);
                        await setState(kv, fromId, null);
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "✅ Ставка успешно добавлена!", reply_markup: mainMenuKeyboard });
                    }
                }
                return new Response('OK');
            }

            // Update Bet Status Flow
            if (callbackData === 'update_bet_status_select') {
                const userEmail = await getUserEmailFromTgId(kv, fromId);
                if (userEmail) {
                    const userData = await getUserData(kv, userEmail);
                    const pendingBets = userData.bets.filter(b => b.status === BetStatus.Pending).slice(0, 5); // Get last 5 pending
                    if (pendingBets.length === 0) {
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "У вас нет ставок в ожидании.", reply_markup: mainMenuKeyboard });
                        return new Response('OK');
                    }
                    const betButtons = pendingBets.map(bet => ([{ text: `📝 ${bet.event.substring(0, 30)}...`, callback_data: `update_bet_status:${bet.id}` }]));
                    betButtons.push([{ text: '⬅️ Назад', callback_data: 'main_menu' }]);
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Выберите ставку для обновления:", reply_markup: { inline_keyboard: betButtons } });
                }
                return new Response('OK');
            }
            if (callbackData?.startsWith('update_bet_status:')) {
                const betId = callbackData.replace('update_bet_status:', '');
                await setState(kv, fromId, { step: 'update_bet_awaiting_status', data: { betId } });
                const keyboard = { inline_keyboard: [
                    [{ text: '✅ Выигрыш', callback_data: `set_bet_status:${betId}:${BetStatus.Won}` }, { text: '❌ Проигрыш', callback_data: `set_bet_status:${betId}:${BetStatus.Lost}` }],
                    [{ text: '↩️ Возврат', callback_data: `set_bet_status:${betId}:${BetStatus.Void}` }],
                    [{ text: '⬅️ Назад', callback_data: 'update_bet_status_select' }]
                ]};
                await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Укажите новый статус для ставки:", reply_markup: keyboard });
                return new Response('OK');
            }
            if (callbackData?.startsWith('set_bet_status:')) {
                const [, betId, newStatusStr] = callbackData.split(':');
                const newStatus = newStatusStr as BetStatus;
                const userEmail = await getUserEmailFromTgId(kv, fromId);
                if (userEmail && betId && newStatus) {
                    const userData = await getUserData(kv, userEmail);
                    const betIndex = userData.bets.findIndex(b => b.id === betId);
                    if (betIndex > -1) {
                        const bet = userData.bets[betIndex];
                        bet.status = newStatus;
                        bet.profit = calculateProfit(bet);
                        userData.bets[betIndex] = bet;
                        
                        let profitText = '';
                        if (bet.profit !== 0) {
                             const type = bet.profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
                             const description = `Ставка ${newStatus === BetStatus.Won ? 'выиграла' : 'проиграла'}: ${bet.event}`;
                             await addBankTransactionToUserData(kv, userEmail, bet.profit, type, description, userData);
                             profitText = `\n${bet.profit > 0 ? '💰 Ваш банк пополнен на' : '💸 Ваш банк уменьшен на'} ${Math.abs(bet.profit).toFixed(2)} ₽.`;
                        } else {
                             await saveUserData(kv, userEmail, userData);
                        }
                        
                        await setState(kv, fromId, null);
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `✅ Статус ставки "${bet.event}" изменен на "${newStatus}".${profitText}`, reply_markup: mainMenuKeyboard });
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
                case 'manage_bets':
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Управление ставками:", reply_markup: betManagementKeyboard });
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
                        state.step = 'add_bet_awaiting_status';
                        await setState(kv, fromId, state);
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: 'Какой статус у этой ставки?', reply_markup: addBetStatusKeyboard });
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
                    case 'awaiting_nickname':
                         if (messageText.length < 3) {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Никнейм должен быть не менее 3 символов. Попробуйте снова." });
                            return new Response('OK');
                         }
                         state.data.nickname = messageText;
                         state.step = 'awaiting_email';
                         await setState(kv, fromId, state);
                         await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Отлично! Теперь введите ваш email:" });
                        break;
                    case 'awaiting_email':
                        if (!/^\S+@\S+\.\S+$/.test(messageText)) {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Неверный формат email. Попробуйте снова." });
                            return new Response('OK');
                        }
                        state.data.email = messageText;
                        state.step = 'awaiting_password';
                        await setState(kv, fromId, state);
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Теперь придумайте пароль (мин. 6 символов):" });
                        break;
                    case 'awaiting_password':
                        if (messageText.length < 6) {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Пароль слишком короткий. Попробуйте снова (мин. 6 символов)." });
                            return new Response('OK');
                        }
                        const { nickname, email } = state.data;
                        const password_hash = mockHash(messageText);
                        
                        const newUser = { email, nickname, password_hash, registeredAt: new Date().toISOString(), referralCode: `${nickname!.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`, buttercups: 0, status: 'active' };
                        await kv.put(`user:profile:${email}`, JSON.stringify(newUser));
                        await kv.put(`user:tg:${fromId}`, email!);
                        
                        await addBankTransactionToUserData(kv, email!, 10000, BankTransactionType.Deposit, "Начальный банк при регистрации");

                        await setState(kv, fromId, null);
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `🎉 Регистрация завершена! Ваш аккаунт для ${email} создан и привязан.`, reply_markup: mainMenuKeyboard });
                        break;
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
                case '/ping':
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: 'Pong!' });
                    break;
                case '/stats':
                    const userEmailForStatsCmd = await getUserEmailFromTgId(kv, fromId);
                    if (userEmailForStatsCmd) {
                         await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `✅ Вы авторизованы как ${userEmailForStatsCmd}.\n\nФункционал просмотра статистики и добавления ставок через Telegram находится в разработке.` });
                    } else {
                         await telegramApi(token, 'sendMessage', { chat_id: chatId, text: '❌ Вы не авторизованы. Сначала привяжите аккаунт.' });
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
        const errorBody = await requestClone.text();
        console.error("--- UNHANDLED FATAL ERROR IN WEBHOOK ---");
        console.error("Message:", e.message);
        console.error("Stack:", e.stack);
        console.error("Request Body:", errorBody);
    }
    
    return new Response('OK');
};