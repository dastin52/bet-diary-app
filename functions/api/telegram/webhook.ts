// functions/api/telegram/webhook.ts

import { GoogleGenAI } from "@google/genai";

// --- START OF COPIED TYPES AND UTILS ---
enum BetStatus { Pending = 'pending', Won = 'won', Lost = 'lost', Void = 'void', CashedOut = 'cashed_out' }
enum BetType { Single = 'single', Parlay = 'parlay', System = 'system' }
interface BetLeg { homeTeam: string; awayTeam: string; market: string; }
interface Bet { id: string; createdAt: string; event: string; legs: BetLeg[]; sport: string; bookmaker: string; betType: BetType; stake: number; odds: number; status: BetStatus; profit?: number; tags?: string[]; }
interface User { email: string; nickname: string; password_hash: string; registeredAt: string; }
enum GoalMetric { Profit = 'profit', ROI = 'roi', WinRate = 'win_rate', BetCount = 'bet_count' }
enum GoalStatus { InProgress = 'in_progress', Achieved = 'achieved', Failed = 'failed' }
interface Goal { id: string; title: string; metric: GoalMetric; targetValue: number; currentValue: number; status: GoalStatus; createdAt: string; deadline: string; scope: { type: 'sport' | 'betType' | 'tag' | 'all'; value?: string; }; }

const SPORTS = [ 'Футбол', 'Баскетбол', 'Теннис', 'Хоккей', 'ММА', 'Киберспорт' ];
const MARKETS_BY_SPORT: Record<string, string[]> = {
  'Футбол': [ 'П1', 'X', 'П2', '1X', '12', 'X2', 'Обе забьют - Да', 'Обе забьют - Нет', 'Тотал > 1.5', 'Тотал > 2.5', 'Тотал < 2.5', 'Тотал < 3.5' ],
  'Баскетбол': ['П1 (с ОТ)', 'П2 (с ОТ)', 'Тотал > 210.5', 'Тотал < 210.5', 'Фора 1 (-5.5)', 'Фора 2 (+5.5)'],
  'Теннис': ['П1', 'П2', 'Тотал по геймам > 21.5', 'Тотал по геймам < 21.5', 'Фора 1 по геймам (-2.5)', 'Фора 2 по геймам (+2.5)'],
  'Хоккей': ['П1', 'X', 'П2', '1X', 'X2', 'Тотал > 5.5', 'Тотал < 5.5'],
  'ММА': ['П1', 'П2', 'Тотал раундов > 1.5', 'Тотал раундов < 1.5'],
  'Киберспорт': ['П1', 'П2', 'Тотал карт > 2.5', 'Тотал карт < 2.5']
};
const calculateProfit = (b: {status: BetStatus, stake: number, odds: number, profit?: number}) => b.status === 'won' ? b.stake * (b.odds - 1) : b.status === 'lost' ? -b.stake : (b.profit ?? 0);
const mockHash = (s: string) => `hashed_${s}`;
const calculateRiskManagedStake = (bank:number, odds:number) => { if (bank <= 0 || odds <= 1) return null; let p = odds < 1.5 ? 0.025 : odds < 2.5 ? 0.015 : 0.0075; const stake = bank * p; return stake < 1 ? null : { stake, percentage: p * 100 }; };
function chunkArray<T>(array: T[], size: number): T[][] { const r: T[][] = []; for (let i = 0; i < array.length; i += size) { r.push(array.slice(i, i + size)); } return r; }
const getGoalProgress = (goal: Goal): { percentage: number, label: string } => {
    const percentage = goal.targetValue !== 0 ? (goal.currentValue / goal.targetValue) * 100 : 0;
    let label = '';
    switch (goal.metric) {
        case GoalMetric.Profit: label = `${goal.currentValue.toFixed(2)} / ${goal.targetValue.toFixed(2)} ₽`; break;
        case GoalMetric.ROI: case GoalMetric.WinRate: label = `${goal.currentValue.toFixed(2)}% / ${goal.targetValue.toFixed(2)}%`; break;
        case GoalMetric.BetCount: label = `${goal.currentValue} / ${goal.targetValue}`; break;
    }
    return { percentage: Math.max(0, Math.min(100, percentage)), label };
};
// --- END OF COPIED TYPES & UTILS ---

// --- TELEGRAM & CF TYPES ---
interface TelegramFrom { id: number; }
interface TelegramChat { id: number; }
interface TelegramMessage { message_id: number; from: TelegramFrom; chat: TelegramChat; text?: string; }
interface TelegramCallbackQuery { id: string; from: TelegramFrom; message: TelegramMessage; data: string; }
interface TelegramWebhookRequest { message?: TelegramMessage; callback_query?: TelegramCallbackQuery; }
interface KVNamespace { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>; delete(key: string): Promise<void>; }
interface Env { TELEGRAM_API_TOKEN: string; GEMINI_API_KEY: string; BOT_STATE: KVNamespace; }
interface EventContext<E> { request: Request; env: E; }
type PagesFunction<E = unknown> = (context: EventContext<E>) => Response | Promise<Response>;

// --- API HELPERS ---
const apiRequest = async (token: string, method: string, body: object) => {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Telegram API Error: ${method} failed with status ${response.status}`, errorBody);
    }
    return response;
};
const sendMessage = (t: string, c: number, x: string, r = {}) => apiRequest(t, 'sendMessage', { chat_id: c, text: x, parse_mode: 'Markdown', reply_markup: r });
const editMessageText = (t: string, c: number, m: number, x: string, r = {}) => apiRequest(t, 'editMessageText', { chat_id: c, message_id: m, text: x, parse_mode: 'Markdown', reply_markup: r });
const deleteMessage = (t: string, c: number, m: number) => apiRequest(t, 'deleteMessage', { chat_id: c, message_id: m });
const answerCallbackQuery = (t: string, i: string, x?: string) => apiRequest(t, 'answerCallbackQuery', { callback_query_id: i, text: x });

// --- ROBUST STATE MGMT ---
const getUserState = async (env: Env, u: number): Promise<any | null> => {
    const json = await env.BOT_STATE.get(`tguser:${u}`);
    if (!json) return null;
    try {
        return JSON.parse(json);
    } catch (e) {
        console.error(`CORRUPTED STATE for user ${u}. Deleting state. Error:`, e);
        await env.BOT_STATE.delete(`tguser:${u}`);
        return null;
    }
};
const setUserState = (env: Env, u: number, s: any) => env.BOT_STATE.put(`tguser:${u}`, JSON.stringify(s));

function normalizeState(state: any): any {
    if (!state) return null;
    // Ensure essential arrays and values exist to prevent runtime errors from old state schemas
    return {
        user: state.user || null,
        bets: Array.isArray(state.bets) ? state.bets : [],
        goals: Array.isArray(state.goals) ? state.goals : [],
        bankroll: typeof state.bankroll === 'number' ? state.bankroll : 10000,
        dialog: state.dialog || null,
    };
}


// --- KEYBOARDS & CONSTANTS ---
const mainMenuKeyboard = { inline_keyboard: [[{ text: "📊 Статистика", callback_data: "stats" }, { text: "✍️ Добавить ставку", callback_data: "add_bet" }], [{ text: "⚙️ Управление ставками", callback_data: "manage_bets" }, { text: "🏦 Управление банком", callback_data: "manage_bank" }], [{ text: "🤖 AI-Аналитик", callback_data: "ai_chat" }], [{ text: "🏆 Соревнования", callback_data: "competitions" }, { text: "🎯 Мои цели", callback_data: "goals" }]] };
const backToMenuKeyboard = (mid?: number) => ({ inline_keyboard: [[{ text: "⬅️ В меню", callback_data: `main_menu${mid ? ':'+mid : ''}` }]] });
const cancelKeyboard = (mid?: number) => ({ inline_keyboard: [[{ text: "❌ Отмена", callback_data: `main_menu${mid ? ':'+mid : ''}` }]] });
const backAndCancelKeyboard = (backCb: string, mid?: number) => ({ inline_keyboard: [[{ text: "⬅️ Назад", callback_data: backCb }, { text: "❌ Отмена", callback_data: `main_menu${mid ? ':'+mid : ''}` }]] });

const sessionExpiredText = "⚠️ Сессия истекла или данные повреждены. Пожалуйста, перезапустите бота командой /start.";
const sessionExpiredKeyboard = { inline_keyboard: [[{ text: "🔄 Перезапустить", callback_data: "main_menu" }]] };

// --- MAIN HANDLER ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.TELEGRAM_API_TOKEN || !env.BOT_STATE) { console.error("FATAL: Environment variables are not set."); return new Response('OK'); }
    try {
        const body = await request.json() as TelegramWebhookRequest;
        if (body.callback_query) await handleCallbackQuery(body.callback_query, env);
        else if (body.message) await handleMessage(body.message, env);
    } catch (e: any) {
        console.error("Top-level error in webhook:", e.message, e.stack);
    }
    return new Response('OK');
};

// --- ROUTERS ---
async function handleMessage(msg: TelegramMessage, env: Env) {
    const text = msg.text || ''; const cid = msg.chat.id; const uid = msg.from.id;
    const rawState = await getUserState(env, uid);
    const state = normalizeState(rawState);

    if (text.startsWith('/')) return handleCommand(text, cid, uid, env, state);
    if (/^\d{6}$/.test(text)) return handleAuthCode(text, cid, uid, env);
    if (state?.dialog?.name) return handleDialog(msg, state, env);
    
    if (state?.user) {
        await sendMessage(env.TELEGRAM_API_TOKEN, cid, `👋 Привет, ${state.user.nickname}! Чем могу помочь?`, mainMenuKeyboard);
    } else {
        await sendMessage(env.TELEGRAM_API_TOKEN, cid, "👋 Добро пожаловать! Зарегистрируйтесь или привяжите аккаунт, сгенерировав код в приложении.", { inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "register" }]] });
    }
}

async function handleCallbackQuery(cb: TelegramCallbackQuery, env: Env) {
    const data = cb.data; const cid = cb.message.chat.id; const mid = cb.message.message_id; const uid = cb.from.id;
    await answerCallbackQuery(env.TELEGRAM_API_TOKEN, cb.id);
    
    const rawState = await getUserState(env, uid);
    const state = normalizeState(rawState);
    
    const [action] = data.split(':');

    if (!state && !['register', 'main_menu'].includes(action)) {
        return editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "⚠️ Сначала привяжите аккаунт или зарегистрируйтесь.", { inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "register" }]] });
    }
    
    const handlers: { [key: string]: (d: string, c: number, m: number, e: Env, u: number, s: any) => Promise<void> } = {
        main_menu: showMainMenu, stats: handleStats, add_bet: startAddBet, manage_bets: showPendingBets, show_bet: showBetStatusOptions,
        set_status: setBetStatus, manage_bank: showBankMenu, ai_chat: startAiChat, exit_ai_chat: showMainMenu, competitions: showCompetitions,
        goals: showGoals, add_goal: startAddGoal, delete_goal_prompt: promptDeleteGoal, delete_goal_confirm: deleteGoal, register: startRegistration,
    };
    if (action.startsWith('add_bet_')) return handleAddBetDialogCallback(data, cid, mid, env, uid, state);
    if (action.startsWith('bank_')) return handleBankDialogCallback(data, cid, mid, env, uid, state);
    if (action.startsWith('add_goal_')) return handleAddGoalDialogCallback(data, cid, mid, env, uid, state);
    if (handlers[action]) await handlers[action](data, cid, mid, env, uid, state);
}

async function handleDialog(msg: TelegramMessage, state: any, env: Env) {
    const name = state.dialog.name;
    const handlers: Record<string, Function> = {
        ai_chat_active: processAiChatMessage,
        registration_email: processRegistrationEmail, registration_nickname: processRegistrationNickname, registration_password: processRegistrationPassword,
        add_bet_event: processAddBetEvent, add_bet_stake: processAddBetStake, add_bet_odds: processAddBetOdds,
        bank_adjust: processBankAdjustment,
        add_goal_title: processAddGoalTitle, 
        add_goal_target: processAddGoalTarget, 
        add_goal_deadline: processAddGoalDeadline
    };
    if (handlers[name]) await handlers[name](msg, state, env);
}

// --- STATE-CHECKING WRAPPER ---
async function handleStatefulAction(mid: number | undefined, cid: number, state: any, env: Env, actionFn: () => Promise<any>) {
    if (!state || !state.user) {
        const text = sessionExpiredText;
        const kb = sessionExpiredKeyboard;
        if (mid) return await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, text, kb);
        else return await sendMessage(env.TELEGRAM_API_TOKEN, cid, text, kb);
    }
    return await actionFn();
}

// --- COMMANDS & AUTH ---
async function handleCommand(text: string, cid: number, uid: number, env: Env, state: any) {
    if (text === '/start' || text === '/help') {
        await showMainMenu('', cid, undefined, env, uid, state);
    }
}
async function handleAuthCode(code: string, cid: number, uid: number, env: Env) {
    try {
        const dataJson = await env.BOT_STATE.get(`tgauth:${code}`);
        if (!dataJson) return sendMessage(env.TELEGRAM_API_TOKEN, cid, "❌ Неверный или истекший код.");
        const data = JSON.parse(dataJson);
        await setUserState(env, uid, data);
        await env.BOT_STATE.delete(`tgauth:${code}`);
        await sendMessage(env.TELEGRAM_API_TOKEN, cid, `✅ Аккаунт *${data.user.nickname}* успешно привязан!`, mainMenuKeyboard);
    } catch(e) {
        console.error("Auth code handling error", e);
        await sendMessage(env.TELEGRAM_API_TOKEN, cid, "❌ Произошла ошибка при обработке кода.");
    }
}

// --- CORE FEATURES ---
async function showMainMenu(data: string, cid: number, mid: number | undefined, env: Env, uid: number, state: any, text?: string) {
    const messageId = mid ?? parseInt(data.split(':')[1] || '0');
    if (state?.dialog) { state.dialog = null; await setUserState(env, uid, state); }

    if (state?.user) {
        const welcomeText = text || `🏠 Главное меню, ${state.user.nickname}!`;
        if (messageId > 0) await editMessageText(env.TELEGRAM_API_TOKEN, cid, messageId, welcomeText, mainMenuKeyboard);
        else await sendMessage(env.TELEGRAM_API_TOKEN, cid, welcomeText, mainMenuKeyboard);
    } else {
        const notLoggedInText = "👋 Добро пожаловать! Зарегистрируйтесь или привяжите аккаунт.";
        const kb = { inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "register" }]] };
        if (messageId > 0) await editMessageText(env.TELEGRAM_API_TOKEN, cid, messageId, notLoggedInText, kb);
        else await sendMessage(env.TELEGRAM_API_TOKEN, cid, notLoggedInText, kb);
    }
}

async function handleStats(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const { bets, bankroll } = state;
        const settled = bets.filter((b: Bet) => b.status !== 'pending');
        const profit = settled.reduce((a: number, b: Bet) => a + (calculateProfit(b) || 0), 0);
        const text = `📊 *Ваша статистика*\n\n*Банк:* ${bankroll.toFixed(2)} ₽\n*Прибыль:* ${profit.toFixed(2)} ₽\n*Всего ставок:* ${settled.length}`;
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, text, backToMenuKeyboard(mid));
    });
}

// --- REGISTRATION ---
async function startRegistration(data: string, cid: number, mid: number, env: Env, uid: number) {
    await setUserState(env, uid, { dialog: { name: 'registration_email', data: {}, msgId: mid } });
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "📝 Давайте зарегистрируемся. Введите ваш E-mail:", cancelKeyboard(mid));
}
async function processRegistrationEmail(msg: TelegramMessage, state: any, env: Env) {
    state.dialog.data.email = msg.text; state.dialog.name = 'registration_nickname';
    await setUserState(env, msg.from.id, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "👍 Отлично. Теперь введите ваш никнейм:", backAndCancelKeyboard('register', state.dialog.msgId));
}
async function processRegistrationNickname(msg: TelegramMessage, state: any, env: Env) {
    state.dialog.data.nickname = msg.text; state.dialog.name = 'registration_password';
    await setUserState(env, msg.from.id, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "🔒 Теперь придумайте пароль (рекомендуем удалить сообщение после ввода):", backAndCancelKeyboard('registration_email', state.dialog.msgId));
}
async function processRegistrationPassword(msg: TelegramMessage, state: any, env: Env) {
    const { email, nickname } = state.dialog.data;
    const newUser = { email, nickname, password_hash: mockHash(msg.text || ''), registeredAt: new Date().toISOString() };
    await setUserState(env, msg.from.id, { user: newUser, bets: [], bankroll: 10000, goals: [], dialog: null });
    await deleteMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, msg.message_id);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, `✅ Регистрация завершена! Добро пожаловать, *${nickname}*!`, mainMenuKeyboard);
}

// --- BET CREATION ---
async function startAddBet(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        await setUserState(env, uid, { ...state, dialog: { name: 'add_bet_sport', data: {}, msgId: mid } });
        const sportButtons = chunkArray(SPORTS.map(s => ({text: s, callback_data: `add_bet_sport:${s}`})), 3);
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "👇 Выберите вид спорта:", { inline_keyboard: [...sportButtons, cancelKeyboard(mid).inline_keyboard[0]] });
    });
}
async function handleAddBetDialogCallback(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const [action, value] = data.split(':');
        const dialog = state.dialog; if (!dialog) return;

        if (action === 'add_bet_sport') {
            dialog.data.sport = value; dialog.name = 'add_bet_event'; await setUserState(env, uid, state);
            await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "✍️ Введите событие (например, `Команда 1 - Команда 2`):", backAndCancelKeyboard('add_bet', mid));
        } else if (action === 'add_bet_outcome') {
            dialog.data.outcome = value; dialog.name = 'add_bet_stake'; await setUserState(env, uid, state);
            const recommended = calculateRiskManagedStake(state.bankroll, 2.0);
            const kb = recommended ? { inline_keyboard: [[{ text: `💡 Рекомендуемая: ${recommended.stake.toFixed(0)} ₽`, callback_data: `add_bet_stake:${recommended.stake.toFixed(0)}` }], ...backAndCancelKeyboard('add_bet_event', mid).inline_keyboard] } : backAndCancelKeyboard('add_bet_event', mid);
            await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "💰 Введите сумму ставки:", kb);
        } else if (action === 'add_bet_stake') {
            dialog.name = 'add_bet_odds'; dialog.data.stake = parseFloat(value || '0'); await setUserState(env, uid, state);
            await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "📈 Введите коэффициент:", backAndCancelKeyboard(`add_bet_outcome:${dialog.data.outcome}`, mid));
        } else if (action === 'add_bet_confirm') {
            const { sport, event, outcome, stake, odds } = dialog.data;
            const [homeTeam, awayTeam] = event.split('-').map((s: string) => s.trim());
            const newBet: Bet = { id: new Date().toISOString(), createdAt: new Date().toISOString(), event: `${event} - ${outcome}`, sport, betType: BetType.Single, stake, odds, status: BetStatus.Pending, legs: [{homeTeam, awayTeam, market: outcome}], bookmaker: 'Telegram' };
            state.bets.unshift(newBet); state.dialog = null; await setUserState(env, uid, state);
            await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, `✅ Ставка добавлена:\n${newBet.event} @ ${odds} на ${stake} ₽`, backToMenuKeyboard(mid));
        }
    });
}
async function processAddBetEvent(msg: TelegramMessage, state: any, env: Env) {
    state.dialog.name = 'add_bet_outcome'; state.dialog.data.event = msg.text; await setUserState(env, msg.from.id, state);
    const markets = MARKETS_BY_SPORT[state.dialog.data.sport] || ['П1', 'X', 'П2'];
    const marketButtons = chunkArray(markets.map(m => ({text:m, callback_data:`add_bet_outcome:${m}`})), 3);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "🎯 Выберите исход:", { inline_keyboard: [...marketButtons, ...backAndCancelKeyboard('add_bet', state.dialog.msgId).inline_keyboard]});
}
async function processAddBetStake(msg: TelegramMessage, state: any, env: Env) {
    await deleteMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, msg.message_id); // delete user input
    state.dialog.name = 'add_bet_odds'; state.dialog.data.stake = parseFloat(msg.text || '0'); await setUserState(env, msg.from.id, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "📈 Введите коэффициент:", backAndCancelKeyboard(`add_bet_outcome:${state.dialog.data.outcome}`, state.dialog.msgId));
}
async function processAddBetOdds(msg: TelegramMessage, state: any, env: Env) {
    await deleteMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, msg.message_id); // delete user input
    state.dialog.data.odds = parseFloat(msg.text || '0');
    const { sport, event, outcome, stake, odds } = state.dialog.data;
    const text = `👀 *Проверьте ставку:*\n\n*Спорт:* ${sport}\n*Событие:* ${event}\n*Исход:* ${outcome}\n*Ставка:* ${stake} ₽\n*Коэф.:* ${odds}`;
    await setUserState(env, msg.from.id, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, text, { inline_keyboard: [[{text: '✅ Подтвердить', callback_data: 'add_bet_confirm'}], ...backAndCancelKeyboard(`add_bet_stake:${stake}`, state.dialog.msgId).inline_keyboard] });
}

// --- BET MANAGEMENT ---
async function showPendingBets(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const { bets } = state;
        const pending = bets.filter((b: Bet) => b.status === 'pending');
        if (pending.length === 0) return editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "Нет ожидающих ставок.", backToMenuKeyboard(mid));
        const keyboard = pending.map((b: Bet) => [{ text: `${b.event} @ ${b.odds}`, callback_data: `show_bet:${b.id}` }]);
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "👇 Выберите ставку для обновления:", { inline_keyboard: [...keyboard, ...backToMenuKeyboard(mid).inline_keyboard] });
    });
}
async function showBetStatusOptions(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const { bets } = state;
        const betId = data.split(':').slice(1).join(':');
        const bet = bets.find((b: Bet) => b.id === betId);
        if (!bet) return editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "❌ Ставка не найдена.", backToMenuKeyboard(mid));
        const kb = { inline_keyboard: [[{ text: "✅ Выигрыш", callback_data: `set_status:won:${betId}` }, { text: "❌ Проигрыш", callback_data: `set_status:lost:${betId}` }], [{ text: "🔄 Возврат", callback_data: `set_status:void:${betId}` }], [{ text: "⬅️ Назад", callback_data: 'manage_bets' }]] };
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, `*Ставка:*\n${bet.event}\n\nВыберите новый статус:`, kb);
    });
}
async function setBetStatus(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const parts = data.split(':'); const status = parts[1]; const betId = parts.slice(2).join(':');
        const betIdx = state.bets.findIndex((b: Bet) => b.id === betId);
        if (betIdx === -1) return editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "❌ Ставка не найдена.", backToMenuKeyboard(mid));
        state.bets[betIdx].status = status as BetStatus;
        const profit = calculateProfit(state.bets[betIdx]);
        state.bets[betIdx].profit = profit; state.bankroll += profit; await setUserState(env, uid, state);
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, `✅ Статус ставки обновлен на *${status}*.`, { inline_keyboard: [[{ text: "⬅️ К списку ставок", callback_data: 'manage_bets' }], ...backToMenuKeyboard(mid).inline_keyboard] });
    });
}

// --- BANK MANAGEMENT ---
async function showBankMenu(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const text = `🏦 *Управление банком*\n\nТекущий баланс: *${state.bankroll.toFixed(2)} ₽*`;
        const kb = { inline_keyboard: [[{text: "➕ Пополнить", callback_data: "bank_deposit"}, {text: "➖ Снять", callback_data: "bank_withdraw"}], ...backToMenuKeyboard(mid).inline_keyboard] };
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, text, kb);
    });
}
async function handleBankDialogCallback(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const type = data.startsWith('bank_deposit') ? 'deposit' : 'withdraw';
        await setUserState(env, uid, {...state, dialog: { name: 'bank_adjust', type, msgId: mid }});
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, type === 'deposit' ? "➕ Введите сумму пополнения:" : "➖ Введите сумму для снятия:", cancelKeyboard(mid));
    });
}
async function processBankAdjustment(msg: TelegramMessage, state: any, env: Env) {
    const amount = parseFloat(msg.text || '0');
    if (isNaN(amount) || amount <= 0) return sendMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, "❌ Неверная сумма. Попробуйте еще раз.");
    state.bankroll += (state.dialog.type === 'deposit' ? amount : -amount);
    const mid = state.dialog.msgId; state.dialog = null; await setUserState(env, msg.from.id, state);
    await deleteMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, msg.message_id);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, mid, `✅ Баланс обновлен! Новый баланс: *${state.bankroll.toFixed(2)} ₽*`, backToMenuKeyboard(mid));
}

// --- AI CHAT ---
async function startAiChat(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        await setUserState(env, uid, { ...state, dialog: { name: 'ai_chat_active', msgId: mid } });
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "🤖 Вы вошли в чат с AI-Аналитиком. Задайте вопрос.", { inline_keyboard: [[{ text: "⬅️ Выйти из чата", callback_data: `exit_ai_chat:${mid}` }]] });
    });
}
async function processAiChatMessage(msg: TelegramMessage, state: any, env: Env) {
    const cid = msg.chat.id;
    let thinkingMsgId: number | null = null;
    try {
        const thinkingMsgResponse = await sendMessage(env.TELEGRAM_API_TOKEN, cid, "🤖 Думаю...");
        const thinkingMsgJson: any = await thinkingMsgResponse.json();
        if (!thinkingMsgJson.ok) throw new Error('Failed to send thinking message');
        thinkingMsgId = thinkingMsgJson.result.message_id;

        const ai = new GoogleGenAI({apiKey: env.GEMINI_API_KEY});
        const profit = state.bets.filter((b:Bet)=>b.status!=='pending').reduce((a:number, b:Bet)=>a+(calculateProfit(b)),0);
        const context = `User stats: bankroll=${state.bankroll}, total_profit=${profit}. User question: ${msg.text}`;
        
        const res = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [{role: 'user', parts: [{text: context}]}] });
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, thinkingMsgId, res.text);
    } catch (e) { 
        console.error("AI chat error:", e);
        if (thinkingMsgId) await editMessageText(env.TELEGRAM_API_TOKEN, cid, thinkingMsgId, "❌ Ошибка при обращении к AI.");
    }
}

// --- COMPETITIONS ---
async function showCompetitions(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "🏆 Функция соревнований в разработке.", backToMenuKeyboard(mid));
    });
}

// --- GOALS ---
async function showGoals(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const { goals } = state;
        let text = "🎯 *Ваши Цели*\n\n";
        const buttons = [];
        if (goals.length > 0) {
            goals.forEach((g: Goal) => {
                const { label } = getGoalProgress(g);
                text += `*${g.title}*\n_${label}_\n\n`;
                buttons.push([{ text: `🗑️ ${g.title}`, callback_data: `delete_goal_prompt:${g.id}` }]);
            });
        } else {
            text += "_У вас нет активных целей._";
        }
        const keyboard = { inline_keyboard: [[{ text: "➕ Новая цель", callback_data: "add_goal" }], ...buttons, ...backToMenuKeyboard(mid).inline_keyboard] };
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, text, keyboard);
    });
}
async function promptDeleteGoal(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const goalId = data.split(':')[1];
        const goal = state.goals.find((g: Goal) => g.id === goalId);
        if (!goal) return editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "❌ Цель не найдена.", { inline_keyboard: [[{ text: "⬅️ К целям", callback_data: 'goals' }]] });
        const kb = { inline_keyboard: [[{ text: `✅ Да, удалить`, callback_data: `delete_goal_confirm:${goalId}` }, { text: "⬅️ Нет", callback_data: 'goals' }]] };
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, `Вы уверены, что хотите удалить цель "${goal.title}"?`, kb);
    });
}
async function deleteGoal(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const goalId = data.split(':')[1];
        state.goals = state.goals.filter((g: Goal) => g.id !== goalId);
        await setUserState(env, uid, state);
        await showGoals('', cid, mid, env, uid, state); // Refresh goal list
    });
}
async function startAddGoal(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        state.dialog = { name: 'add_goal_title', data: {}, msgId: mid };
        await setUserState(env, uid, state);
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "✍️ Введите название цели:", cancelKeyboard(mid));
    });
}
async function processAddGoalTitle(msg: TelegramMessage, state: any, env: Env) {
    state.dialog.data.title = msg.text;
    state.dialog.name = 'add_goal_metric';
    await setUserState(env, msg.from.id, state);
    const kb = { inline_keyboard: [
        [{text: 'Прибыль', callback_data: 'add_goal_metric:profit'}, {text: 'ROI', callback_data: 'add_goal_metric:roi'}],
        [{text: 'Процент побед', callback_data: 'add_goal_metric:win_rate'}, {text: 'Кол-во ставок', callback_data: 'add_goal_metric:bet_count'}],
        ...backAndCancelKeyboard('add_goal', state.dialog.msgId).inline_keyboard
    ]};
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "📊 Выберите метрику:", kb);
}

async function handleAddGoalDialogCallback(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    await handleStatefulAction(mid, cid, state, env, async () => {
        const [action, value] = data.split(':');
        const dialog = state.dialog; if (!dialog) return;

        if (action === 'add_goal_metric') {
            dialog.data.metric = value;
            dialog.name = 'add_goal_target';
            await setUserState(env, uid, state);
            await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "🎯 Введите целевое значение:", backAndCancelKeyboard('add_goal_metric', mid));
        }
    });
}

async function processAddGoalTarget(msg: TelegramMessage, state: any, env: Env) {
    const target = parseFloat(msg.text || '0');
    if (isNaN(target) || target <= 0) {
        return sendMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, "❌ Неверное значение. Введите положительное число.");
    }
    state.dialog.data.target = target;
    state.dialog.name = 'add_goal_deadline';
    await setUserState(env, msg.from.id, state);
    await deleteMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, msg.message_id);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "🗓️ Введите дедлайн в формате ГГГГ-ММ-ДД:", backAndCancelKeyboard(`add_goal_metric:${state.dialog.data.metric}`, state.dialog.msgId));
}

async function processAddGoalDeadline(msg: TelegramMessage, state: any, env: Env) {
    const deadline = msg.text || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || isNaN(new Date(deadline).getTime())) {
         return sendMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, "❌ Неверный формат даты. Введите ГГГГ-ММ-ДД.");
    }
    state.dialog.data.deadline = deadline;
    const { title, metric, target } = state.dialog.data;

    const newGoal: Goal = {
        id: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        title,
        metric: metric as GoalMetric,
        targetValue: target,
        deadline,
        currentValue: 0,
        status: GoalStatus.InProgress,
        scope: { type: 'all' } // simplified for now
    };

    if (!state.goals) state.goals = [];
    state.goals.push(newGoal);
    const mid = state.dialog.msgId;
    state.dialog = null;
    await setUserState(env, msg.from.id, state);

    await deleteMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, msg.message_id);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, mid, `✅ Новая цель "${title}" создана!`, backToMenuKeyboard(mid));
}
