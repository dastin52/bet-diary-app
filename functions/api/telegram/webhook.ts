// functions/api/telegram/webhook.ts

// --- TYPE DEFINITIONS ---

interface Env {
    TELEGRAM_BOT_TOKEN: string;
    BOT_STATE: KVNamespace;
}

interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
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

// --- MOCK RISK MANAGEMENT (to be replaced with a real model if needed) ---
const calculateRiskManagedStake = (bankroll: number, odds: number): { stake: number; percentage: number } | null => {
  if (bankroll <= 0 || odds <= 1) return null;
  let percentageOfBankroll = 0.01; // Kelly criterion approximation
  if (odds < 1.5) percentageOfBankroll = 0.025;
  else if (odds < 2.5) percentageOfBankroll = 0.015;
  else if (odds < 4.0) percentageOfBankroll = 0.0075;
  else percentageOfBankroll = 0.005;

  const recommendedStake = bankroll * percentageOfBankroll;
  if (recommendedStake < 1) return null;
  return { stake: recommendedStake, percentage: percentageOfBankroll * 100 };
};


// --- TELEGRAM API HELPERS ---

async function sendMessage(token: string, chatId: number, text: string, reply_markup?: any): Promise<void> {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup }),
    });
}

// --- CORE LOGIC ---

async function handleStart(chatId: number, env: Env) {
    const userEmail = await env.BOT_STATE.get(`telegram:${chatId}`);
    if (userEmail) {
        await showMainMenu(chatId, env, `С возвращением, ${userEmail}!`);
    } else {
        const text = `👋 *Добро пожаловать в BetDiary Bot!*

Чтобы начать, привяжите ваш аккаунт или зарегистрируйтесь.`;
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text, {
            inline_keyboard: [
                [{ text: "🔑 Привязать аккаунт с сайта", callback_data: "link_account" }],
                [{ text: "📝 Зарегистрировать новый аккаунт", callback_data: "register" }]
            ]
        });
    }
}

async function showMainMenu(chatId: number, env: Env, text: string) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text, {
        inline_keyboard: [
            [{ text: "📝 Добавить ставку", callback_data: "add_bet_start" }],
            [{ text: "📈 Управление ставками", callback_data: "manage_bets" }],
            [{ text: "📊 Просмотр статистики", callback_data: "view_stats" }],
            [{ text: "💰 Управление банком", callback_data: "manage_bank" }],
        ]
    });
}


// --- MAIN HANDLER ---

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.BOT_STATE) {
        console.error("FATAL: Telegram Bot Token or KV Namespace is not configured.");
        return new Response('Server configuration error', { status: 500 });
    }

    const requestClone = request.clone(); // Clone for safe body reading

    try {
        const update = await request.json() as TelegramUpdate;

        const message = update.message || update.callback_query?.message;
        const text = update.message?.text?.trim();
        const chatId = message?.chat.id;
        const userId = update.callback_query?.from.id || update.message?.from.id;
        const callbackData = update.callback_query?.data;
        
        if (!chatId || !userId) {
            return new Response('OK', { status: 200 });
        }
        
        const userEmail = await env.BOT_STATE.get(`telegram:${userId}`);
        const currentAction = await env.BOT_STATE.get(`user:${userId}:action`);
        
        // --- COMMAND HANDLING ---
        if (text) {
             switch (text) {
                case '/start':
                case '/menu':
                    await env.BOT_STATE.delete(`user:${userId}:action`); // Clear any pending action
                    await handleStart(chatId, env);
                    return new Response('OK', { status: 200 });
                case '/add':
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Начинаем добавление ставки. Какой коэффициент?");
                    await env.BOT_STATE.put(`user:${userId}:action`, "add_bet_odds");
                    return new Response('OK', { status: 200 });
                case '/manage':
                     await showMainMenu(chatId, env, "Выберите действие:"); // Simplified for now
                     return new Response('OK', { status: 200 });
                case '/stats':
                     await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Статистика в разработке.");
                     return new Response('OK', { status: 200 });
                 case '/getcode':
                     // Logic for generating code to log in on website
                     return new Response('OK', { status: 200 });
            }
        }

        // --- ACTION/DIALOG HANDLING ---
        if (currentAction) {
             const [action, ...params] = currentAction.split(':');
             
             if (action === 'add_bet_odds') {
                const odds = parseFloat(text || '');
                if (isNaN(odds) || odds <= 1) {
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Некорректный коэффициент. Пожалуйста, введите число больше 1.");
                    return new Response('OK', { status: 200 });
                }
                
                // Fetch user data to get bankroll
                // This is a placeholder as user data is not yet in KV
                const bankroll = 10000; // Mock bankroll
                const recommendation = calculateRiskManagedStake(bankroll, odds);
                
                let recommendationText = `Отлично, коэффициент: ${odds}.`;
                let keyboard;

                if (recommendation) {
                    recommendationText += `\n\n💡 *Рекомендуемая ставка:* ${recommendation.stake.toFixed(2)} ₽ (${recommendation.percentage.toFixed(1)}% от банка).`;
                    keyboard = { inline_keyboard: [[{ text: `Использовать рекомендованную (${recommendation.stake.toFixed(2)} ₽)`, callback_data: `use_recommended_stake:${recommendation.stake.toFixed(2)}:${odds}` }]] };
                }
                
                recommendationText += "\n\nТеперь введите сумму ставки.";
                
                await env.BOT_STATE.put(`user:${userId}:action`, `add_bet_stake:${odds}`);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, recommendationText, keyboard);

                return new Response('OK', { status: 200 });
            }
            
            // Further steps like add_bet_stake would be handled here
        }
        
        // --- CALLBACK HANDLING ---
        if (callbackData) {
            const [action, ...params] = callbackData.split(':');
            
            if (action === 'use_recommended_stake') {
                const [stake, odds] = params;
                 await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Выбрана ставка ${stake} ₽ с коэф. ${odds}. Дальнейший ввод пока в разработке.`);
                 await env.BOT_STATE.delete(`user:${userId}:action`);
            }
            // Logic for 'set_bet_status' etc.
            if (action === 'set_bet_status') {
                 await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Статус ставки изменен (действие: ${params.join(':')}). Логика в разработке.`);
            }
        }


    } catch (error) {
        console.error("Webhook Error:", error);
        // Try to read the body as text for logging if JSON parsing failed
        try {
            const rawBody = await requestClone.text();
            console.error("Failed request body:", rawBody);
        } catch (e) {
            console.error("Could not even read request body as text.");
        }
    }
    
    // Always acknowledge Telegram
    return new Response('OK', { status: 200 });
};
