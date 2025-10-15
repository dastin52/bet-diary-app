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

// --- MENUS ---
const getMainMenu = (isLinked: boolean) => ({
    inline_keyboard: [
        [{ text: "📝 Добавить ставку", callback_data: "add_bet" }, { text: "📈 Управление ставками", callback_data: "manage_bets" }],
        [{ text: "📊 Просмотр статистики", callback_data: "view_stats" }, { text: "💰 Управление банком", callback_data: "bank_management" }],
        isLinked ? [] : [{ text: "🔑 Получить код для сайта", callback_data: "get_web_code" }],
    ].filter(row => row.length > 0)
});

const getRegistrationMenu = () => ({
    inline_keyboard: [
        [{ text: "✅ Зарегистрировать новый аккаунт", callback_data: "register_account" }],
        [{ text: "🔗 Привязать аккаунт с сайта", callback_data: "link_account" }],
    ]
});

// --- MAIN HANDLER ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    // 1. Initial Checks and Parsing
    if (!env.TELEGRAM_BOT_TOKEN || !env.BOT_STATE) {
        console.error("FATAL: Telegram Bot Token or KV Namespace is not configured.");
        return new Response('Server configuration error', { status: 500 });
    }

    const requestClone = request.clone(); // Clone for safe body reading in case of error
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
        if (callbackQueryId) await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQueryId);

        const userLinkKey = `telegram:${userId}`;
        const userEmail = await env.BOT_STATE.get(userLinkKey);
        
        // 2. Command Handling
        if (text && text.startsWith('/')) {
            await setDialogState(env.BOT_STATE, userId, null);
            switch (text.split(' ')[0]) {
                case '/start':
                    if (userEmail) {
                        const userData = await getUserData(env.BOT_STATE, userEmail);
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `С возвращением, ${userData?.nickname || 'пользователь'}! 👋`, getMainMenu(true));
                    } else {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "👋 Добро пожаловать в Дневник Ставок! \n\nВы новый пользователь? Зарегистрируйтесь или привяжите существующий аккаунт.", getRegistrationMenu());
                    }
                    return new Response('OK');
                
                case '/menu':
                    if (userEmail) await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "🏠 Главное меню:", getMainMenu(true));
                    else await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Вы не авторизованы.", getRegistrationMenu());
                    return new Response('OK');
                
                // Add more commands here...
            }
        }

        // 3. Callback Query Handling (Button Presses)
        if (callbackData) {
            const [action] = callbackData.split(':');
            switch (action) {
                case 'register_account':
                    await setDialogState(env.BOT_STATE, userId, { action: 'register_ask_nickname', data: {} });
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Отлично! Давайте создадим аккаунт.\n\nКакой у вас будет никнейм?");
                    return new Response('OK');
                
                case 'link_account':
                     await setDialogState(env.BOT_STATE, userId, { action: 'link_ask_code', data: {} });
                     await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Пожалуйста, сгенерируйте 6-значный код в приложении ('Настройки' -> 'Интеграция с Telegram') и отправьте его мне.");
                     return new Response('OK');
                
                case 'main_menu':
                    if (userEmail && messageId) await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "🏠 Главное меню:", getMainMenu(true));
                    return new Response('OK');

                // Fallback for any other button press if not logged in
                default:
                    if (!userEmail) {
                         await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Пожалуйста, сначала зарегистрируйтесь или привяжите аккаунт.", getRegistrationMenu());
                         return new Response('OK');
                    }
            }
        }
        
        // 4. Dialog State Handling (Text Replies)
        const dialogState = await getDialogState(env.BOT_STATE, userId);
        if (text && dialogState) {
            switch(dialogState.action) {
                case 'link_ask_code':
                    const code = text.match(/\d{6}/)?.[0];
                    if (!code) {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Это не похоже на 6-значный код. Попробуйте еще раз.");
                        return new Response('OK');
                    }
                    const linkedEmail = await env.BOT_STATE.get(`authcode:${code}`);
                    if (linkedEmail) {
                        await env.BOT_STATE.put(`telegram:${userId}`, linkedEmail);
                        await env.BOT_STATE.delete(`authcode:${code}`);
                        await setDialogState(env.BOT_STATE, userId, null);
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Аккаунт для ${linkedEmail} успешно привязан!`, getMainMenu(true));
                    } else {
                        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый.");
                    }
                    return new Response('OK');
            }
        }

        // Handle unregistered user text
        if (text && !userEmail && !dialogState) {
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Я не понимаю команду. Пожалуйста, используйте кнопки ниже.", getRegistrationMenu());
        }

    } catch (error) {
        console.error("Webhook Error:", error);
        // Emergency logging
        const bodyText = await requestClone.text();
        console.error("Failed request body:", bodyText);

        const chatId = tryToGetChatId(requestClone);
        if (chatId && env.TELEGRAM_BOT_TOKEN) {
             await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Произошла критическая ошибка на сервере. Я уже сообщил разработчикам. \n\n\`${error instanceof Error ? error.message : 'Unknown error'}\``);
        }
    }
    
    return new Response('OK');
};

function tryToGetChatId(request: Request): number | null {
    // This is a failsafe and might not work if the request is malformed, but it's our best bet.
    try {
        const update = JSON.parse(request.headers.get('CF-Connecting-IP') || '{}'); // This is a hack, need to find the body
        return update.message?.chat.id || update.callback_query?.message?.chat.id || null;
    } catch {
        return null;
    }
}
