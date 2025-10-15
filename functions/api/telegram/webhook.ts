// functions/api/telegram/webhook.ts

/**
 * This Cloudflare Function is the backend for the Telegram bot.
 * IMPORTANT:
 * 1. Bind a KV Namespace as "BOT_STATE" in your Cloudflare project.
 * 2. Set "TELEGRAM_BOT_TOKEN" as an environment variable.
 */

interface KVNamespace {
    put(key: string, value: string, options?: { expiration?: number; expirationTtl?: number; metadata?: any; }): Promise<void>;
    get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<string | any | ArrayBuffer | ReadableStream | null>;
}

interface EventContext<Env> {
    request: Request;
    env: Env;
}

type PagesFunction<Env = unknown> = (
    context: EventContext<Env>
) => Response | Promise<Response>;

interface Env {
    BOT_STATE: KVNamespace;
    TELEGRAM_BOT_TOKEN: string;
}

// --- Telegram API Helper ---
const telegramApi = async (token: string, methodName: string, body: object) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${methodName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!result.ok) {
        console.error(`Telegram API error (${methodName}):`, result.description);
    }
    return result;
};

// --- Main Handler ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    const { TELEGRAM_BOT_TOKEN, BOT_STATE } = env;

    if (!TELEGRAM_BOT_TOKEN || !BOT_STATE) {
        console.error("Missing environment variables (TELEGRAM_BOT_TOKEN or BOT_STATE). Bot will not function.");
        return new Response('Bot not configured', { status: 500 });
    }
    
    const update = await request.json() as any;
    
    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
    const text = (update.message?.text || update.callback_query?.data || '').trim();
    const fromId = update.message?.from.id || update.callback_query?.from.id;

    if (!chatId || !text) {
        return new Response('OK'); // Not a message we can handle
    }

    try {
        if (text === '/start') {
            await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                chat_id: chatId,
                text: "Добро пожаловать в Дневник Ставок!\n\n" +
                      "Чтобы привязать свой аккаунт, сгенерируйте код в приложении ('Настройки' -> 'Интеграция с Telegram') и отправьте его мне.",
            });
        } else if (text === '/stats') {
            const userEmail = await BOT_STATE.get(`user:tg:${fromId}`);
            if (userEmail) {
                await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                    chat_id: chatId,
                    text: `✅ Вы авторизованы как ${userEmail}.\n\nФункционал просмотра статистики и добавления ставок через Telegram находится в разработке.`
                });
            } else {
                await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                    chat_id: chatId,
                    text: `⚠️ Вы не авторизованы. Пожалуйста, привяжите ваш аккаунт, отправив 6-значный код из настроек на сайте.`
                });
            }
        } else {
             const codeMatch = text.match(/^\d{6}$/);
             if (codeMatch) {
                const code = codeMatch[0];
                const email = await BOT_STATE.get(`authcode:${code}`);

                if (email) {
                    await BOT_STATE.put(`user:tg:${fromId}`, email);
                    await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                       chat_id: chatId,
                       text: `✅ Аккаунт для ${email} успешно привязан! Теперь вы можете использовать команду /stats для проверки статуса.`
                    });
                } else {
                    await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                       chat_id: chatId,
                       text: `❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый код на сайте и попробуйте снова.`
                    });
                }
             } else {
                 await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                    chat_id: chatId,
                    text: `Я не понял вашу команду. Доступные команды:\n/start - Начало работы\n/stats - Проверить статус аккаунта`
                 });
             }
        }
    } catch (e) {
        console.error("Error handling Telegram update:", e);
        // Inform user of an error if possible
        if (chatId) {
            await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                chat_id: chatId,
                text: "Произошла внутренняя ошибка. Попробуйте позже."
            });
        }
    }
    
    return new Response('OK'); // Always respond to Telegram to avoid retries
};