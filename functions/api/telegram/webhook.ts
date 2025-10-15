
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
interface Achievement { id: string; name: string; description: string; icon: string; }
const SPORTS = [ 'Футбол', 'Баскетбол', 'Теннис', 'Хоккей', 'ММА', 'Киберспорт' ];
const MARKETS_BY_SPORT: Record<string, string[]> = {
  'Футбол': ['П1', 'X', 'П2', '1X', 'X2', 'Обе забьют - Да', 'Тотал > 2.5', 'Тотал < 2.5'],
  'Баскетбол': ['П1 (с ОТ)', 'П2 (с ОТ)', 'Тотал > 220.5', 'Тотал < 220.5'], 'Теннис': ['П1', 'П2', 'Тотал по геймам > 21.5', 'Тотал по геймам < 21.5'],
  'Хоккей': ['П1', 'X', 'П2', 'Тотал > 5.5', 'Тотал < 5.5'], 'Бейсбол': ['П1', 'П2'], 'ММА': ['П1', 'П2'], 'Бокс': ['П1', 'П2'], 'Киберспорт': ['П1', 'П2']
};
const calculateProfit = (b: {status: BetStatus, stake: number, odds: number, profit?: number}) => b.status === 'won' ? b.stake * (b.odds - 1) : b.status === 'lost' ? -b.stake : (b.profit ?? 0);
const mockHash = (s: string) => `hashed_${s}`;
const calculateRiskManagedStake = (bank:number, odds:number) => { if (bank <= 0 || odds <= 1) return null; let p = odds < 1.5 ? 0.025 : odds < 2.5 ? 0.015 : 0.0075; const stake = bank * p; return stake < 1 ? null : { stake, percentage: p * 100 }; };
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
const apiRequest = (t: string, m: string, b: object) => fetch(`https://api.telegram.org/bot${t}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const sendMessage = (t: string, c: number, x: string, r = {}) => apiRequest(t, 'sendMessage', { chat_id: c, text: x, parse_mode: 'Markdown', reply_markup: r });
const editMessageText = (t: string, c: number, m: number, x: string, r = {}) => apiRequest(t, 'editMessageText', { chat_id: c, message_id: m, text: x, parse_mode: 'Markdown', reply_markup: r });
const deleteMessage = (t: string, c: number, m: number) => apiRequest(t, 'deleteMessage', { chat_id: c, message_id: m });
const answerCallbackQuery = (t: string, i: string, x?: string) => apiRequest(t, 'answerCallbackQuery', { callback_query_id: i, text: x });

// --- STATE MGMT ---
const getUserState = async (env: Env, u: number) => { const j = await env.BOT_STATE.get(`tguser:${u}`); return j ? JSON.parse(j) : null; };
const setUserState = (env: Env, u: number, s: any) => env.BOT_STATE.put(`tguser:${u}`, JSON.stringify(s));

// --- KEYBOARDS ---
const mainMenuKeyboard = { inline_keyboard: [[{ text: "📊 Статистика", callback_data: "stats" }, { text: "✍️ Добавить ставку", callback_data: "add_bet" }], [{ text: "⚙️ Управление ставками", callback_data: "manage_bets" }, { text: "🏦 Управление банком", callback_data: "manage_bank" }], [{ text: "🤖 AI-Аналитик", callback_data: "ai_chat" }], [{ text: "🏆 Соревнования", callback_data: "competitions" }, { text: "🎯 Мои цели", callback_data: "goals" }]] };
const backToMenuKeyboard = (mid?: number) => ({ inline_keyboard: [[{ text: "⬅️ В меню", callback_data: `main_menu${mid ? ':'+mid : ''}` }]] });
const cancelKeyboard = (mid?: number) => ({ inline_keyboard: [[{ text: "❌ Отмена", callback_data: `main_menu${mid ? ':'+mid : ''}` }]] });
const backAndCancelKeyboard = (backCb: string, mid?: number) => ({ inline_keyboard: [[{ text: "⬅️ Назад", callback_data: backCb }, { text: "❌ Отмена", callback_data: `main_menu${mid ? ':'+mid : ''}` }]] });

// --- MAIN HANDLER ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.TELEGRAM_API_TOKEN || !env.BOT_STATE) return new Response('OK');
    try {
        // FIX: Use 'as' for type assertion on request.json() result
        const body = await request.json() as TelegramWebhookRequest;
        if (body.callback_query) await handleCallbackQuery(body.callback_query, env);
        else if (body.message) await handleMessage(body.message, env);
    } catch (e) { console.error(e); }
    return new Response('OK');
};

// --- ROUTERS ---
async function handleMessage(msg: TelegramMessage, env: Env) {
    const text = msg.text || ''; const cid = msg.chat.id; const uid = msg.from.id;
    const state = await getUserState(env, uid);
    if (text.startsWith('/')) return handleCommand(text, cid, uid, env);
    if (/^\d{6}$/.test(text)) return handleAuthCode(text, cid, uid, env);
    if (state?.dialog?.name) return handleDialog(msg, state, env);
    await sendMessage(env.TELEGRAM_API_TOKEN, cid, "🤖 Привет! Я бот-помощник для вашего Дневника Ставок. Используйте меню ниже для навигации.", mainMenuKeyboard);
}

async function handleCallbackQuery(cb: TelegramCallbackQuery, env: Env) {
    const data = cb.data; const cid = cb.message.chat.id; const mid = cb.message.message_id; const uid = cb.from.id;
    await answerCallbackQuery(env.TELEGRAM_API_TOKEN, cb.id);
    const state = await getUserState(env, uid);
    if (!state && !['register', 'main_menu'].includes(data.split(':')[0])) {
        return sendMessage(env.TELEGRAM_API_TOKEN, cid, "⚠️ Сначала привяжите аккаунт или зарегистрируйтесь.", { inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "register" }]] });
    }
    const [action] = data.split(':');
    const actionHandlers: Record<string, Function> = {
        main_menu: showMainMenu, stats: handleStats, add_bet: startAddBet, manage_bets: showPendingBets, show_bet: showBetStatusOptions,
        set_status: setBetStatus, manage_bank: showBankMenu, ai_chat: startAiChat, exit_ai_chat: showMainMenu, competitions: showCompetitions,
        goals: showGoals, delete_goal_confirm: deleteGoal, register: startRegistration
    };
    if (action.startsWith('add_bet_')) return handleAddBetDialogCallback(data, cid, mid, env, uid, state);
    if (action.startsWith('bank_')) return handleBankDialogCallback(data, cid, mid, env, uid, state);
    if (actionHandlers[action]) await actionHandlers[action](data, cid, mid, env, uid, state);
}

async function handleDialog(msg: TelegramMessage, state: any, env: Env) {
    const name = state.dialog.name;
    const handlers: Record<string, Function> = {
        ai_chat_active: processAiChatMessage,
        registration_email: processRegistrationEmail, registration_nickname: processRegistrationNickname, registration_password: processRegistrationPassword,
        add_bet_event: processAddBetEvent, add_bet_stake: processAddBetStake, add_bet_odds: processAddBetOdds,
        bank_adjust: processBankAdjustment,
    };
    if (handlers[name]) await handlers[name](msg, state, env);
}

// --- COMMANDS & AUTH ---
async function handleCommand(text: string, cid: number, uid: number, env: Env) {
    const state = await getUserState(env, uid);
    if (text === '/start' || text === '/help') {
        if (state) await showMainMenu('', cid, undefined, env, uid, state, `👋 Привет, ${state.user.nickname}!`);
        else await sendMessage(env.TELEGRAM_API_TOKEN, cid, "👋 Добро пожаловать! Зарегистрируйтесь или привяжите аккаунт.", { inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "register" }]] });
    }
}
async function handleAuthCode(code: string, cid: number, uid: number, env: Env) {
    const dataJson = await env.BOT_STATE.get(`tgauth:${code}`);
    if (!dataJson) return sendMessage(env.TELEGRAM_API_TOKEN, cid, "❌ Неверный или истекший код.");
    const data = JSON.parse(dataJson);
    await setState(env, uid, data);
    await env.BOT_STATE.delete(`tgauth:${code}`);
    await sendMessage(env.TELEGRAM_API_TOKEN, cid, `✅ Аккаунт *${data.user.nickname}* успешно привязан!`, mainMenuKeyboard);
}

// --- CORE FEATURES ---
async function showMainMenu(data: string, cid: number, mid: number | undefined, env: Env, uid: number, state: any, text?: string) {
    await setState(env, uid, { ...state, dialog: null });
    const messageId = mid ?? parseInt(data.split(':')[1] || '0');
    if (messageId > 0) await editMessageText(env.TELEGRAM_API_TOKEN, cid, messageId, text || "🏠 Главное меню", mainMenuKeyboard);
    else await sendMessage(env.TELEGRAM_API_TOKEN, cid, text || "🏠 Главное меню", mainMenuKeyboard);
}

async function handleStats(data: string, cid: number, mid: number | undefined, env: Env, uid: number, state: any) {
    const { bets, bankroll } = state;
    const settled = bets.filter((b: Bet) => b.status !== 'pending');
    const profit = settled.reduce((a: number, b: Bet) => a + (calculateProfit(b) || 0), 0);
    const text = `📊 *Ваша статистика*\\n\\n*Банк:* ${bankroll.toFixed(2)} ₽\\n*Прибыль:* ${profit.toFixed(2)} ₽\\n*Всего ставок:* ${settled.length}`;
    if (mid) await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, text, backToMenuKeyboard(mid));
    else await sendMessage(env.TELEGRAM_API_TOKEN, cid, text, backToMenuKeyboard());
}

// --- REGISTRATION ---
async function startRegistration(data: string, cid: number, mid: number, env: Env, uid: number) {
    await setState(env, uid, { dialog: { name: 'registration_email', data: {}, msgId: mid } });
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "📝 Давайте зарегистрируемся. Введите ваш E-mail:", cancelKeyboard(mid));
}
async function processRegistrationEmail(msg: TelegramMessage, state: any, env: Env) {
    state.dialog.data.email = msg.text;
    state.dialog.name = 'registration_nickname';
    await setState(env, msg.from.id, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "👍 Отлично. Теперь введите ваш никнейм:", backAndCancelKeyboard('register', state.dialog.msgId));
}
async function processRegistrationNickname(msg: TelegramMessage, state: any, env: Env) {
    state.dialog.data.nickname = msg.text;
    state.dialog.name = 'registration_password';
    await setState(env, msg.from.id, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "🔒 Теперь придумайте пароль (рекомендуем удалить сообщение после ввода):", backAndCancelKeyboard('registration_email', state.dialog.msgId));
}
async function processRegistrationPassword(msg: TelegramMessage, state: any, env: Env) {
    const { email, nickname } = state.dialog.data;
    const password = msg.text || '';
    const newUser = { email, nickname, password_hash: mockHash(password), registeredAt: new Date().toISOString() };
    await setState(env, msg.from.id, { user: newUser, bets: [], bankroll: 10000, goals: [], dialog: null });
    await deleteMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, msg.message_id);
    // FIX: Correctly quote template literal
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, `✅ Регистрация завершена! Добро пожаловать, *${nickname}*!`, mainMenuKeyboard);
}

// --- BET CREATION ---
async function startAddBet(data: string, cid: number, mid: number, env: Env, uid: number) {
    const state = await getUserState(env, uid);
    await setState(env, uid, { ...state, dialog: { name: 'add_bet_sport', data: {}, msgId: mid } });
    const keyboard = { inline_keyboard: [SPORTS.map(s => ({text: s, callback_data: `add_bet_sport:${s}`})).slice(0,3), SPORTS.map(s => ({text: s, callback_data: `add_bet_sport:${s}`})).slice(3,6), cancelKeyboard(mid).inline_keyboard[0]] };
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "👇 Выберите вид спорта:", keyboard);
}
async function handleAddBetDialogCallback(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    const [action, value] = data.split(':');
    const dialog = state.dialog;
    if (action === 'add_bet_sport') {
        dialog.data.sport = value; dialog.name = 'add_bet_event';
        await setState(env, uid, state);
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "✍️ Введите событие (например, `Команда 1 - Команда 2`):", backAndCancelKeyboard('add_bet', mid));
    } else if (action === 'add_bet_outcome') {
        dialog.data.outcome = value; dialog.name = 'add_bet_stake';
        await setState(env, uid, state);
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "💰 Введите сумму ставки:", backAndCancelKeyboard('add_bet_event', mid));
    } else if (action === 'add_bet_confirm') {
        const { sport, event, outcome, stake, odds } = dialog.data;
        const newBet: Bet = { id: new Date().toISOString(), createdAt: new Date().toISOString(), event: `${event} - ${outcome}`, sport, betType: BetType.Single, stake, odds, status: BetStatus.Pending, legs: [], bookmaker: 'Telegram' };
        state.bets.push(newBet);
        state.dialog = null;
        await setState(env, uid, state);
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, `✅ Ставка добавлена:\n${newBet.event} @ ${odds} на ${stake} ₽`, backToMenuKeyboard(mid));
    }
}
async function processAddBetEvent(msg: TelegramMessage, state: any, env: Env) {
    state.dialog.name = 'add_bet_outcome'; state.dialog.data.event = msg.text;
    await setState(env, msg.from.id, state);
    const markets = MARKETS_BY_SPORT[state.dialog.data.sport] || ['П1', 'X', 'П2'];
    const keyboard = { inline_keyboard: [markets.map(m => ({text:m, callback_data:`add_bet_outcome:${m}`})), backAndCancelKeyboard('add_bet', state.dialog.msgId).inline_keyboard[0]]};
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "🎯 Выберите исход:", keyboard);
}
async function processAddBetStake(msg: TelegramMessage, state: any, env: Env) {
    state.dialog.name = 'add_bet_odds'; state.dialog.data.stake = parseFloat(msg.text || '0');
    await setState(env, msg.from.id, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, "📈 Введите коэффициент:", backAndCancelKeyboard('add_bet_outcome', state.dialog.msgId));
}
async function processAddBetOdds(msg: TelegramMessage, state: any, env: Env) {
    state.dialog.data.odds = parseFloat(msg.text || '0');
    const { sport, event, outcome, stake, odds } = state.dialog.data;
    const text = `👀 *Проверьте ставку:*\n\n*Спорт:* ${sport}\n*Событие:* ${event}\n*Исход:* ${outcome}\n*Ставка:* ${stake} ₽\n*Коэф.:* ${odds}`;
    await setState(env, msg.from.id, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, state.dialog.msgId, text, { inline_keyboard: [[{text: '✅ Подтвердить', callback_data: 'add_bet_confirm'}], backAndCancelKeyboard('add_bet_stake', state.dialog.msgId).inline_keyboard[0]] });
}

// --- BET MANAGEMENT ---
async function showPendingBets(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    const pending = state.bets.filter((b: Bet) => b.status === 'pending');
    if (pending.length === 0) return editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "Нет ожидающих ставок.", backToMenuKeyboard(mid));
    const keyboard = pending.map((b: Bet) => [{ text: `${b.event} @ ${b.odds}`, callback_data: `show_bet:${b.id}` }]);
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "👇 Выберите ставку для обновления:", { inline_keyboard: [...keyboard, ...backToMenuKeyboard(mid).inline_keyboard] });
}
async function showBetStatusOptions(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    const betId = data.split(':')[1];
    const bet = state.bets.find((b: Bet) => b.id === betId);
    if (!bet) return editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "❌ Ставка не найдена.", backToMenuKeyboard(mid));
    const kb = { inline_keyboard: [[{ text: "✅ Выигрыш", callback_data: `set_status:won:${betId}` }, { text: "❌ Проигрыш", callback_data: `set_status:lost:${betId}` }], [{ text: "🔄 Возврат", callback_data: `set_status:void:${betId}` }], [{ text: "⬅️ Назад", callback_data: 'manage_bets' }]] };
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, `*Ставка:*\n${bet.event}\n\nВыберите новый статус:`, kb);
}
async function setBetStatus(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    const [, status, betId] = data.split(':');
    const betIdx = state.bets.findIndex((b: Bet) => b.id === betId);
    if (betIdx === -1) return editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "❌ Ставка не найдена.", backToMenuKeyboard(mid));
    state.bets[betIdx].status = status as BetStatus;
    const profit = calculateProfit(state.bets[betIdx]);
    state.bets[betIdx].profit = profit;
    state.bankroll += profit;
    await setState(env, uid, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, `✅ Статус ставки обновлен на *${status}*.`, { inline_keyboard: [[{ text: "⬅️ К списку ставок", callback_data: 'manage_bets' }], ...backToMenuKeyboard(mid).inline_keyboard] });
}

// --- BANK MANAGEMENT ---
async function showBankMenu(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    const text = `🏦 *Управление банком*\\n\\nТекущий баланс: *\${state.bankroll.toFixed(2)} ₽*`;
    const kb = { inline_keyboard: [[{text: "➕ Пополнить", callback_data: "bank_deposit"}, {text: "➖ Снять", callback_data: "bank_withdraw"}], ...backToMenuKeyboard(mid).inline_keyboard] };
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, text, kb);
}
async function handleBankDialogCallback(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    const [, type] = data.split(':');
    await setState(env, uid, {...state, dialog: { name: 'bank_adjust', type, msgId: mid }});
    const text = type === 'deposit' ? "➕ Введите сумму пополнения:" : "➖ Введите сумму для снятия:";
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, text, cancelKeyboard(mid));
}
async function processBankAdjustment(msg: TelegramMessage, state: any, env: Env) {
    const amount = parseFloat(msg.text || '0');
    if (isNaN(amount) || amount <= 0) return sendMessage(env.TELEGRAM_API_TOKEN, msg.chat.id, "❌ Неверная сумма. Попробуйте еще раз.");
    state.bankroll += (state.dialog.type === 'deposit' ? amount : -amount);
    const mid = state.dialog.msgId;
    state.dialog = null;
    await setState(env, msg.from.id, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, msg.chat.id, mid, `✅ Баланс обновлен! Новый баланс: *\${state.bankroll.toFixed(2)} ₽*\`, backToMenuKeyboard(mid));
}

// --- AI CHAT ---
async function startAiChat(data: string, cid: number, mid: number, env: Env, uid: number) {
    const state = await getUserState(env, uid);
    await setState(env, uid, { ...state, dialog: { name: 'ai_chat_active', msgId: mid } });
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "🤖 Вы вошли в чат с AI-Аналитиком. Задайте вопрос.", { inline_keyboard: [[{ text: "⬅️ Выйти из чата", callback_data: `exit_ai_chat:${mid}` }]] });
}
async function processAiChatMessage(msg: TelegramMessage, state: any, env: Env) {
    const cid = msg.chat.id;
    const thinkingMsg = await sendMessage(env.TELEGRAM_API_TOKEN, cid, "🤖 Думаю...");
    const thinkingMsgJson: any = await thinkingMsg.json();
    const mid = thinkingMsgJson.result.message_id;
    const ai = new GoogleGenAI({apiKey: env.GEMINI_API_KEY});
    const profit = state.bets.filter((b:Bet)=>b.status!=='pending').reduce((a:number, b:Bet)=>a+(calculateProfit(b)),0);
    const context = `User stats: bankroll=${state.bankroll}, total_profit=${profit}. User question: ${msg.text}`;
    try {
        const res = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [{role: 'user', parts: [{text: context}]}] });
        await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, res.text);
    } catch (e) { await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "❌ Ошибка при обращении к AI."); }
}

// --- COMPETITIONS & GOALS ---
async function showCompetitions(data: string, cid: number, mid: number, env: Env) {
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "🏆 Функция соревнований в разработке.", backToMenuKeyboard(mid));
}
async function showGoals(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    if (!state.goals || state.goals.length === 0) return editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "🎯 У вас нет активных целей.", backToMenuKeyboard(mid));
    let text = "🎯 *Ваши цели*\\n\\n";
    state.goals.forEach((g: Goal) => { text += `* ${g.title}* - \${(g.currentValue / g.targetValue * 100).toFixed(1)}%\\n`; });
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, text, { inline_keyboard: [[{text: "🗑️ Удалить цель", callback_data:"delete_goal_confirm"}], ...backToMenuKeyboard(mid).inline_keyboard]});
}
async function deleteGoal(data: string, cid: number, mid: number, env: Env, uid: number, state: any) {
    if (state.goals && state.goals.length > 0) state.goals.shift(); // Simplified
    await setState(env, uid, state);
    await editMessageText(env.TELEGRAM_API_TOKEN, cid, mid, "✅ Цель удалена.", backToMenuKeyboard(mid));
}
