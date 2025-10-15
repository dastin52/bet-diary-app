// functions/api/telegram/webhook.ts

// --- TYPE DEFINITIONS ---
import { Bet, BetLeg, BetStatus, BetType, BankTransaction, BankTransactionType, User, Goal, GoalMetric, GoalStatus } from '../../../src/types';
import { SPORTS, BOOKMAKERS, BET_STATUS_OPTIONS, MARKETS_BY_SPORT } from '../../../src/constants';

interface Env {
    TELEGRAM_BOT_TOKEN: string;
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
async function apiRequest(token: string, method: string, body: object) {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`Telegram API error (${method}):`, errorData);
        }
    } catch (error) {
        console.error(`Failed to call Telegram API (${method}):`, error);
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
        await kv.put(`dialog:${userId}`, JSON.stringify(state), { expirationTtl: 300 }); // 5 min TTL for dialogs
    }
};
const getEmailByNickname = async (kv: KVNamespace, nickname: string): Promise<string | null> => {
    return await kv.get(`nickname:${nickname.toLowerCase()}`);
};
const saveNicknameMapping = async (kv: KVNamespace, nickname: string, email: string): Promise<void> => {
    await kv.put(`nickname:${nickname.toLowerCase()}`, email);
};


// --- MENUS ---
const getMainMenu = (isLinked: boolean) => ({
    inline_keyboard: [
        [{ text: "📝 Добавить ставку", callback_data: "add_bet" }, { text: "📈 Управление ставками", callback_data: "manage_bets" }],
        [{ text: "📊 Просмотр статистики", callback_data: "view_stats" }, { text: "💰 Управление банком", callback_data: "bank_management" }],
    ]
});

const getNewUserMenu = () => ({
    inline_keyboard: [
        [{ text: "✍️ Регистрация в боте", callback_data: "register" }],
        [{ text: "🔗 У меня есть аккаунт", callback_data: "link_account" }],
    ]
});

const getBankMenu = (bankroll: number) => ({
    inline_keyboard: [
        [{ text: `➕ Пополнить (вручную)`, callback_data: "deposit" }],
        [{ text: `➖ Снять (вручную)`, callback_data: "withdraw" }],
        [{ text: "⬅️ Назад в меню", callback_data: "main_menu" }]
    ]
});

async function sendNewUserWelcome(token: string, chatId: number, messageId?: number) {
    const welcomeText = "👋 *Добро пожаловать в Дневник Ставок!*\n\n" +
                        "Этот бот — ваш помощник для быстрого доступа к функциям сайта.\n\n" +
                        "Если у вас еще нет аккаунта, нажмите 'Регистрация'. Если уже есть — привяжите его.";
    const menu = getNewUserMenu();

    if (messageId) {
        await editMessageText(token, chatId, messageId, welcomeText, menu);
    } else {
        await sendMessage(token, chatId, welcomeText, menu);
    }
}


// --- MAIN HANDLER ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.BOT_STATE) {
        console.error("FATAL: Telegram Bot Token or KV Namespace is not configured.");
        return new Response('Server configuration error', { status: 500 });
    }

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
            }
        }

        if (callbackQueryId) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQueryId);
            const [action] = callbackData.split(':');
            
            // Public actions (for new users)
            switch(action) {
                case 'start_new_user':
                    if (messageId) await sendNewUserWelcome(env.TELEGRAM_BOT_TOKEN, chatId, messageId);
                    return new Response('OK');

                case 'register':
                    await setDialogState(env.BOT_STATE, userId, { action: 'register_ask_email', data: {} });
                    const askEmailText = "✍️ *Регистрация*\n\nПожалуйста, введите ваш email-адрес.";
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, askEmailText, { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] });
                    return new Response('OK');
                
                case 'link_account':
                     await setDialogState(env.BOT_STATE, userId, { action: 'link_ask_code', data: {} });
                     const instructionText = "🔐 *Привязка аккаунта*\n\n" +
                                             "1. Откройте сайт Дневника Ставок.\n" +
                                             "2. Перейдите в *Настройки* ➝ *Интеграция с Telegram*.\n" +
                                             "3. Нажмите *'Сгенерировать код'*.\n" +
                                             "4. Отправьте полученный 6-значный код в этот чат.";
                     const backButtonCallback = userEmail ? "main_menu" : "start_new_user";
                     if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, instructionText, { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: backButtonCallback }]] });
                     else await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, instructionText);
                     
                     return new Response('OK');
            }

            // Private actions (require linked account)
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

            switch (action) {
                case 'main_menu':
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `С возвращением, ${userData?.nickname || 'пользователь'}! 👋\n\nЧем могу помочь?`, getMainMenu(true));
                    return new Response('OK');

                case 'view_stats':
                    const settledBets = userData.bets.filter(b => b.status !== 'pending');
                    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
                    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
                    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
                    const wonBets = settledBets.filter(b => b.status === 'won').length;
                    const nonVoidBets = settledBets.filter(b => b.status !== 'void');
                    const winRate = nonVoidBets.length > 0 ? (wonBets / nonVoidBets.length) * 100 : 0;

                    const statsText = `📊 *Ваша статистика:*\n\n` +
                                      `💰 *Текущий банк:* ${userData.bankroll.toFixed(2)} ₽\n` +
                                      `📈 *Общая прибыль:* ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} ₽\n` +
                                      `🎯 *ROI:* ${roi.toFixed(2)}%\n` +
                                      `✅ *Процент побед:* ${winRate.toFixed(2)}%\n` +
                                      `📋 *Всего ставок:* ${settledBets.length}`;
                    
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, statsText, { inline_keyboard: [[{ text: "⬅️ Назад в меню", callback_data: "main_menu" }]] });
                    return new Response('OK');
                
                case 'add_bet':
                    await setDialogState(env.BOT_STATE, userId, { action: 'add_bet_parse', data: {} });
                    const addBetText = "📝 *Добавление новой ставки*\n\n" +
                                       "Отправьте данные о ставке одним сообщением в формате:\n" +
                                       "`Спорт, Команда 1 vs Команда 2, Исход, Сумма, Коэффициент`\n\n" +
                                       "*Пример:*\n" +
                                       "`Футбол, Реал Мадрид vs Барселона, П1, 100, 2.15`";
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, addBetText, { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "main_menu" }]] });
                    return new Response('OK');
                
                case 'manage_bets':
                    const pendingBets = userData.bets.filter(b => b.status === BetStatus.Pending).slice(0, 5); // Show first 5
                    let manageText = "📈 *Управление ставками*\n\nВыберите ставку для обновления статуса:";
                    const keyboard = [];
                    if (pendingBets.length > 0) {
                        for (const bet of pendingBets) {
                            keyboard.push([{ text: `[${bet.sport}] ${bet.event}`, callback_data: `show_bet:${bet.id}` }]);
                        }
                    } else {
                        manageText = "📈 *Управление ставками*\n\nУ вас нет ставок в ожидании.";
                    }
                    keyboard.push([{ text: "⬅️ Назад в меню", callback_data: "main_menu" }]);
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, manageText, { inline_keyboard: keyboard });
                    return new Response('OK');
                
                case 'show_bet':
                    const betIdToShow = callbackData.split(':')[1];
                    const betToShow = userData.bets.find(b => b.id === betIdToShow);
                    if (!betToShow) {
                        if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "❌ Ставка не найдена.", { inline_keyboard: [[{ text: "⬅️ К списку ставок", callback_data: "manage_bets" }]] });
                        return new Response('OK');
                    }
                    const betDetailsText = `*Детали ставки:*\n` +
                                           `*Событие:* ${betToShow.event}\n` +
                                           `*Сумма:* ${betToShow.stake} ₽\n` +
                                           `*Коэф.:* ${betToShow.odds}\n\n` +
                                           `*Как она сыграла?*`;
                    const betKeyboard = {
                        inline_keyboard: [
                            [{ text: "✅ Выигрыш", callback_data: `set_status:${betToShow.id}:won` }],
                            [{ text: "❌ Проигрыш", callback_data: `set_status:${betToShow.id}:lost` }],
                            [{ text: "🔄 Возврат", callback_data: `set_status:${betToShow.id}:void` }],
                            [{ text: "⬅️ К списку ставок", callback_data: "manage_bets" }]
                        ]
                    };
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, betDetailsText, betKeyboard);
                    return new Response('OK');

                case 'set_status':
                    const [, betIdToSet, newStatusStr] = callbackData.split(':');
                    const newStatus = newStatusStr as BetStatus;
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
                    
                    if (profit !== 0 || newStatus === BetStatus.Void) { // Void has 0 profit but should be logged
                        const transaction: BankTransaction = {
                            id: new Date().toISOString() + Math.random(),
                            timestamp: new Date().toISOString(),
                            type: transactionType,
                            amount: profit,
                            previousBalance: userData.bankroll,
                            newBalance: userData.bankroll + profit,
                            description: `${BET_STATUS_OPTIONS.find(o=>o.value === newStatus)?.label}: ${betToUpdate.event}`,
                            betId: betToUpdate.id,
                        };
                        userData.bankroll += profit;
                        userData.bankHistory.unshift(transaction);
                    }

                    await saveUserData(env.BOT_STATE, userEmail, userData);
                    const confirmationText = `✅ Статус для *${betToUpdate.event}* обновлен на *${BET_STATUS_OPTIONS.find(o=>o.value === newStatus)?.label}*.\nПрибыль: ${profit.toFixed(2)} ₽`;
                    if (messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, confirmationText, { inline_keyboard: [[{ text: "⬅️ К списку ставок", callback_data: "manage_bets" }]] });
                    return new Response('OK');


                case 'bank_management':
                    const bankText = `💰 *Управление банком*\n\n` +
                                     `Ваш текущий баланс: *${userData.bankroll.toFixed(2)} ₽*\n\n` +
                                     `Здесь вы можете вручную скорректировать свой банк, например, после пополнения счета у букмекера или вывода средств.`;
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
            }
        }
        
        const dialogState = await getDialogState(env.BOT_STATE, userId);
        if (text && dialogState) {
            // Need userEmail for some actions
            const userData = userEmail ? await getUserData(env.BOT_STATE, userEmail) : null;

            switch(dialogState.action) {
                case 'link_ask_code':
                    const code = text.match(/\d{6}/)?.[0];
                    if (!code) {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Это не похоже на 6-значный код. Попробуйте еще раз.");
                        return new Response('OK');
                    }
                    const userDataString = await env.BOT_STATE.get(`tgauth:${code}`);
                    if (userDataString) {
                        const fullUserData = JSON.parse(userDataString) as UserData;
                        // 1. Link Telegram ID to user's email
                        await env.BOT_STATE.put(`telegram:${userId}`, fullUserData.email);
                        // 2. Save the full user data package for the bot to use
                        await saveUserData(env.BOT_STATE, fullUserData.email, fullUserData);
                        // 3. Clean up the temporary auth code
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

                    if (isNaN(amount) || amount <= 0) {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Неверная сумма. Пожалуйста, введите положительное число.", { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "bank_management" }]] });
                        return new Response('OK');
                    }
                    if (!isDeposit && amount > userData.bankroll) {
                         await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Сумма снятия не может превышать текущий банк.", { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "bank_management" }]] });
                         return new Response('OK');
                    }

                    const finalAmount = isDeposit ? amount : -amount;
                    const transaction: BankTransaction = {
                        id: new Date().toISOString() + Math.random(),
                        timestamp: new Date().toISOString(),
                        type: isDeposit ? BankTransactionType.Deposit : BankTransactionType.Withdrawal,
                        amount: finalAmount,
                        previousBalance: userData.bankroll,
                        newBalance: userData.bankroll + finalAmount,
                        description: isDeposit ? 'Ручное пополнение (Telegram)' : 'Вывод средств (Telegram)',
                    };
                    userData.bankroll += finalAmount;
                    userData.bankHistory.unshift(transaction);
                    
                    await saveUserData(env.BOT_STATE, userEmail, userData);
                    await setDialogState(env.BOT_STATE, userId, null);
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Банк обновлен. Новый баланс: *${userData.bankroll.toFixed(2)} ₽*`, getMainMenu(true));
                    return new Response('OK');
                
                case 'register_ask_email':
                    const email = text.toLowerCase();
                    if (!/^\S+@\S+\.\S+$/.test(email)) {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Неверный формат email. Попробуйте снова.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] });
                        return new Response('OK');
                    }
                    const existingUser = await getUserData(env.BOT_STATE, email);
                    if (existingUser) {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Этот email уже зарегистрирован. Попробуйте другой или привяжите существующий аккаунт.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] });
                        return new Response('OK');
                    }
                    await setDialogState(env.BOT_STATE, userId, { action: 'register_ask_nickname', data: { email } });
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Отлично! Теперь придумайте никнейм (мин. 3 символа).");
                    return new Response('OK');

                case 'register_ask_nickname':
                    const nickname = text;
                    if (nickname.length < 3) {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Никнейм должен быть не менее 3 символов. Попробуйте снова.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] });
                        return new Response('OK');
                    }
                    const existingNickname = await getEmailByNickname(env.BOT_STATE, nickname);
                    if (existingNickname) {
                         await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Этот никнейм уже занят. Попробуйте другой.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] });
                        return new Response('OK');
                    }
                    await setDialogState(env.BOT_STATE, userId, { action: 'register_ask_password', data: { ...dialogState.data, nickname } });
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Придумайте пароль (мин. 6 символов).\n\n⚠️ *ВНИМАНИЕ: Не используйте важные пароли!* После отправки, пожалуйста, удалите сообщение с паролем из чата.");
                    return new Response('OK');
                
                case 'register_ask_password':
                    const password = text;
                    if (password.length < 6) {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Пароль должен быть не менее 6 символов. Попробуйте снова.", { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_new_user" }]] });
                        return new Response('OK');
                    }

                    const { email: regEmail, nickname: regNickname } = dialogState.data;
                    
                    const newUser: UserData = {
                        email: regEmail,
                        nickname: regNickname,
                        password_hash: mockHash(password),
                        registeredAt: new Date().toISOString(),
                        referralCode: `${regNickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                        buttercups: 0,
                        status: 'active',
                        bankroll: 10000, // Initial bankroll
                        bets: [],
                        bankHistory: [{
                            id: new Date().toISOString() + Math.random(),
                            timestamp: new Date().toISOString(),
                            type: BankTransactionType.Deposit,
                            amount: 10000,
                            previousBalance: 0,
                            newBalance: 10000,
                            description: 'Начальный банк',
                        }],
                        goals: [],
                    };

                    await saveUserData(env.BOT_STATE, regEmail, newUser);
                    await saveNicknameMapping(env.BOT_STATE, regNickname, regEmail);
                    await env.BOT_STATE.put(`telegram:${userId}`, regEmail);
                    await setDialogState(env.BOT_STATE, userId, null);

                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `🎉 *Регистрация завершена!* \n\nВаш аккаунт для *${regEmail}* создан и привязан к этому чату.\n\nМожете удалить сообщения с вашими данными для безопасности.`, getMainMenu(true));

                    return new Response('OK');
                
                case 'add_bet_parse':
                    try {
                        if (!userEmail || !userData) throw new Error("Сессия пользователя не найдена. Пожалуйста, /start");
                        const parts = text.split(',').map(p => p.trim());
                        if (parts.length !== 5) throw new Error("Неверный формат. Ожидалось 5 частей, разделенных запятой.");
                        
                        const [sport, teams, market, stakeStr, oddsStr] = parts;
                        const [homeTeam, awayTeam] = teams.split('vs').map(t => t.trim());
                        const stake = parseFloat(stakeStr);
                        const odds = parseFloat(oddsStr);

                        if (!sport || !homeTeam || !awayTeam || !market || isNaN(stake) || isNaN(odds) || stake <= 0 || odds <= 1) {
                            throw new Error("Одно или несколько полей некорректны. Проверьте данные и попробуйте снова.");
                        }
                        
                        const newBet: Bet = {
                            sport,
                            legs: [{ homeTeam, awayTeam, market }],
                            bookmaker: 'Telegram',
                            betType: BetType.Single,
                            stake,
                            odds,
                            status: BetStatus.Pending,
                            id: new Date().toISOString() + Math.random(),
                            createdAt: new Date().toISOString(),
                            event: generateEventString([{ homeTeam, awayTeam, market }], BetType.Single, sport),
                            tags: ['telegram'],
                        };

                        userData.bets.unshift(newBet);
                        await saveUserData(env.BOT_STATE, userEmail, userData);
                        await setDialogState(env.BOT_STATE, userId, null);
                        
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Ставка успешно добавлена:\n*${newBet.event}*`, getMainMenu(true));

                    } catch (e) {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Ошибка: ${e.message}\n\nПожалуйста, попробуйте еще раз или нажмите 'Отмена'.`, { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "main_menu" }]] });
                    }
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
             if (chatId) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Произошла критическая ошибка на сервере. Я уже сообщил разработчикам.`);
             }
        } catch {}
    }
    
    return new Response('OK');
};
