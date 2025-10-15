// functions/api/telegram/webhook.ts

// --- TYPE DEFINITIONS ---
interface KVNamespace {
    put(key: string, value: string, options?: { expiration?: number; expirationTtl?: number; metadata?: any; }): Promise<void>;
    get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<string | null>;
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
interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
}
interface TelegramChat {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
}
interface TelegramMessage {
    message_id: number;
    from: TelegramUser;
    chat: TelegramChat;
    date: number;
    text?: string;
}
interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
}


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
            // Don't re-throw here to prevent function from crashing
        }
        return response;
    } catch (error) {
        console.error(`Network error calling Telegram API (${methodName}):`, error instanceof Error ? error.message : String(error));
    }
};

// --- CORE LOGIC HANDLERS ---
async function handleStart(token: string, chatId: number) {
    await telegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: "👋 Добро пожаловать в Дневник Ставок!\n\n" +
              "Чтобы привязать свой аккаунт, сгенерируйте 6-значный код в приложении ('Настройки' ➔ 'Интеграция с Telegram') и отправьте его мне.",
    });
}

async function handleStats(token: string, chatId: number, fromId: number, kv: KVNamespace) {
    const userEmail = await kv.get(`user:tg:${fromId}`);
    if (userEmail) {
        await telegramApi(token, 'sendMessage', {
            chat_id: chatId,
            text: `✅ Вы авторизованы как ${userEmail}.\n\nФункционал просмотра статистики и добавления ставок через Telegram находится в разработке.`
        });
    } else {
        await telegramApi(token, 'sendMessage', {
            chat_id: chatId,
            text: `⚠️ Вы не авторизованы. Пожалуйста, привяжите ваш аккаунт, отправив 6-значный код из настроек на сайте.`
        });
    }
}

async function handleAuthCode(token: string, chatId: number, fromId: number, code: string, kv: KVNamespace) {
    const authKey = `authcode:${code}`;
    const email = await kv.get(authKey);

    if (email) {
        await kv.put(`user:tg:${fromId}`, email);
        await kv.delete(authKey); // Delete the code after use
        await telegramApi(token, 'sendMessage', {
           chat_id: chatId,
           text: `✅ Аккаунт для ${email} успешно привязан! Теперь вы можете использовать команду /stats для проверки статуса.`
        });
    } else {
        await telegramApi(token, 'sendMessage', {
           chat_id: chatId,
           text: `❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый код на сайте и попробуйте снова.`
        });
    }
}

async function handleUnknownCommand(token: string, chatId: number) {
     await telegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: `Я не понял вашу команду. Доступные команды:\n/start - Начало работы\n/stats - Проверить статус аккаунта`
     });
}

// --- MAIN FUNCTION HANDLER ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    // 1. Critical Environment Checks
    if (!env.TELEGRAM_BOT_TOKEN) {
        console.error("FATAL: TELEGRAM_BOT_TOKEN environment variable is not set.");
        return new Response('OK'); // Respond OK to prevent Telegram retries
    }
    if (!env.BOT_STATE) {
        console.error("FATAL: BOT_STATE KV Namespace is not bound.");
        return new Response('OK');
    }

    try {
        // Safely get the raw body text first. This is less likely to fail than .json()
        const rawBody = await request.text();
        console.log("Received raw request body:", rawBody);

        let update: TelegramUpdate;
        try {
            // Now, safely parse the text.
            update = JSON.parse(rawBody);
        } catch (jsonError: any) {
            console.error("Failed to parse incoming JSON:", jsonError.message);
            return new Response('OK'); // Not a valid JSON, but acknowledge receipt.
        }

        const message = update.message;

        if (!message || !message.chat?.id || !message.from?.id || !message.text) {
            console.log("Received a non-text message or incomplete update, skipping.");
            return new Response('OK');
        }

        const chatId = message.chat.id;
        const fromId = message.from.id;
        const text = message.text.trim();
        const token = env.TELEGRAM_BOT_TOKEN;

        console.log(`Processing message from chat ID ${chatId}: "${text}"`);

        // Routing logic
        if (text === '/start') {
            await handleStart(token, chatId);
        } else if (text === '/stats') {
            await handleStats(token, chatId, fromId, env.BOT_STATE);
        } else if (/^\d{6}$/.test(text)) {
            await handleAuthCode(token, chatId, fromId, text, env.BOT_STATE);
        } else {
            await handleUnknownCommand(token, chatId);
        }

    } catch (e: any) {
        console.error("--- UNHANDLED FATAL ERROR IN WEBHOOK ---");
        console.error("Error message:", e.message);
        console.error("Error stack:", e.stack);
    }
    
    // Always respond 200 OK to Telegram to acknowledge receipt and prevent retries.
    return new Response('OK');
};