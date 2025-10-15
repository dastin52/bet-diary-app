
// functions/api/telegram/webhook.ts

// --- TYPE DEFINITIONS ---

interface TelegramMessage {
    message_id: number;
    from: {
        id: number;
        is_bot: boolean;
        first_name: string;
        username: string;
        language_code: string;
    };
    chat: {
        id: number;
        first_name: string;
        username: string;
        type: 'private';
    };
    date: number;
    text: string;
}

interface TelegramWebhookRequest {
    update_id: number;
    message: TelegramMessage;
}

interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

// Environment variables and bindings for the Cloudflare Function
interface Env {
    TELEGRAM_API_TOKEN: string;
    GEMINI_API_KEY: string;
    BOT_STATE: KVNamespace;
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;


// --- TELEGRAM API HELPER ---

async function sendMessage(chatId: number, text: string, token: string): Promise<Response> {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
}

// --- COMMAND HANDLERS ---

async function handleStart(chatId: number, token: string) {
    const text = "Добро пожаловать в BetDiary Bot! 🤖\n\n" +
        "Чтобы привязать ваш аккаунт, сгенерируйте код в настройках веб-приложения и отправьте его мне.\n\n" +
        "Доступные команды:\n" +
        "`/stats` - Показать вашу текущую статистику.\n" +
        "`/help` - Показать это сообщение.";
    await sendMessage(chatId, text, token);
}

async function handleHelp(chatId: number, token: string) {
    await handleStart(chatId, token);
}

async function handleAuthCode(code: string, chatId: number, env: Env) {
    const { BOT_STATE, TELEGRAM_API_TOKEN } = env;

    const userDataJson = await BOT_STATE.get(`tgauth:${code}`);
    if (!userDataJson) {
        await sendMessage(chatId, "❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый код в приложении.", TELEGRAM_API_TOKEN);
        return;
    }

    // Link the Telegram chat ID to the user's data (using email as the primary key)
    const userData = JSON.parse(userDataJson);
    await BOT_STATE.put(`tguser:${chatId}`, JSON.stringify(userData));

    await sendMessage(chatId, `✅ Аккаунт *${userData.nickname}* успешно привязан! Теперь вы можете использовать команды.`, TELEGRAM_API_TOKEN);
}

async function handleStats(chatId: number, env: Env) {
     const { BOT_STATE, TELEGRAM_API_TOKEN } = env;

    const userDataJson = await BOT_STATE.get(`tguser:${chatId}`);
    if (!userDataJson) {
        await sendMessage(chatId, "⚠️ Ваш аккаунт не привязан. Отправьте мне код из настроек веб-приложения.", TELEGRAM_API_TOKEN);
        return;
    }
    
    // In a real app, you would parse the full userData to get analytics.
    const userData = JSON.parse(userDataJson);
    const totalProfit = userData.bets?.reduce((acc: number, b: { profit?: number }) => acc + (b.profit ?? 0), 0) ?? 0;
    
    // A simplified stats summary for Telegram
    const text = `📊 *Ваша статистика*\n\n` +
        `*Банк:* ${userData.bankroll?.toFixed(2) ?? 'N/A'} ₽\n` +
        `*Общая прибыль:* ${totalProfit.toFixed(2)} ₽`;

    await sendMessage(chatId, text, TELEGRAM_API_TOKEN);
}

// --- MAIN WEBHOOK HANDLER ---

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    // Validate required environment variables
    if (!env.TELEGRAM_API_TOKEN || !env.GEMINI_API_KEY || !env.BOT_STATE) {
        console.error("Missing required environment variables (TELEGRAM_API_TOKEN, GEMINI_API_KEY, or BOT_STATE binding).");
        // Don't return an error response to Telegram, as it may retry. Just log it.
        return new Response('Configuration error', { status: 200 });
    }

    try {
        const body = await request.json() as TelegramWebhookRequest;
        const message = body.message;

        if (message && message.text) {
            const text = message.text.trim();
            const chatId = message.chat.id;

            if (text.startsWith('/')) {
                // Command handling
                if (text === '/start') {
                    await handleStart(chatId, env.TELEGRAM_API_TOKEN);
                } else if (text === '/help') {
                    await handleHelp(chatId, env.TELEGRAM_API_TOKEN);
                } else if (text === '/stats') {
                    await handleStats(chatId, env);
                } else {
                    await sendMessage(chatId, "🤔 Неизвестная команда. Используйте `/help` для списка команд.", env.TELEGRAM_API_TOKEN);
                }
            } else if (/^\d{6}$/.test(text)) {
                // Auth code handling (6-digit number)
                await handleAuthCode(text, chatId, env);
            } else {
                // Default message handling (e.g., could be for adding a bet via text)
                await sendMessage(chatId, "Для взаимодействия используйте команды, например `/help`.", env.TELEGRAM_API_TOKEN);
            }
        }
    } catch (error) {
        console.error('Telegram webhook error:', error);
    }
    
    // Always return a 200 OK to Telegram to acknowledge receipt of the webhook
    return new Response('OK', { status: 200 });
};
