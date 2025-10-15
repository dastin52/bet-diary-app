// functions/api/telegram/webhook.ts

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
    try {
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
    } catch (error) {
        console.error(`Failed to call Telegram API (${methodName}):`, error);
        // Re-throw to be caught by the main handler
        throw new Error(`Network error calling Telegram API: ${methodName}`);
    }
};

// --- Main Handler ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    let chatId: number | undefined;

    try {
        // 1. Critical Environment Variable & Binding Checks
        if (!env.TELEGRAM_BOT_TOKEN) {
            console.error("FATAL: TELEGRAM_BOT_TOKEN environment variable is not set in Cloudflare.");
            return new Response('Bot configuration error: Token missing', { status: 500 });
        }
        if (!env.BOT_STATE) {
            console.error("FATAL: BOT_STATE KV Namespace is not bound in Cloudflare.");
            return new Response('Bot configuration error: KV missing', { status: 500 });
        }
        
        const update = await request.json() as any;
        const message = update.message;

        if (!message || !message.chat || !message.chat.id) {
            console.log("Received a non-message update, skipping.");
            return new Response('OK');
        }
        
        // Set chatId as early as possible for error reporting
        chatId = message.chat.id;

        if (!message.text || !message.from || !message.from.id) {
            console.log("Message is missing text or sender info, skipping.");
            return new Response('OK');
        }

        const text = message.text.trim();
        const fromId = message.from.id;

        console.log(`Processing message from chat ID ${chatId}: "${text}"`);

        if (text === '/start') {
            await telegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
                chat_id: chatId,
                text: "👋 Добро пожаловать в Дневник Ставок!\n\n" +
                      "Чтобы привязать свой аккаунт, сгенерируйте 6-значный код в приложении ('Настройки' ➔ 'Интеграция с Telegram') и отправьте его мне.",
            });
        } else if (text === '/stats') {
            const userEmail = await env.BOT_STATE.get(`user:tg:${fromId}`);
            if (userEmail) {
                await telegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
                    chat_id: chatId,
                    text: `✅ Вы авторизованы как ${userEmail}.\n\nФункционал просмотра статистики и добавления ставок через Telegram находится в разработке.`
                });
            } else {
                await telegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
                    chat_id: chatId,
                    text: `⚠️ Вы не авторизованы. Пожалуйста, привяжите ваш аккаунт, отправив 6-значный код из настроек на сайте.`
                });
            }
        } else if (/^\d{6}$/.test(text)) {
            const code = text;
            const email = await env.BOT_STATE.get(`authcode:${code}`);

            if (email) {
                await env.BOT_STATE.put(`user:tg:${fromId}`, email);
                await telegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
                   chat_id: chatId,
                   text: `✅ Аккаунт для ${email} успешно привязан! Теперь вы можете использовать команду /stats для проверки статуса.`
                });
            } else {
                await telegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
                   chat_id: chatId,
                   text: `❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый код на сайте и попробуйте снова.`
                });
            }
         } else {
             await telegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
                chat_id: chatId,
                text: `Я не понял вашу команду. Доступные команды:\n/start - Начало работы\n/stats - Проверить статус аккаунта`
             });
         }
    } catch (e: any) {
        console.error("FATAL ERROR in webhook handler:", e.stack || e.message || e);
        // **DEBUGGING FEATURE**: Report the error back to the user's chat.
        // This will expose server errors to the user, so it should be removed in a stable production environment.
        if (chatId && env.TELEGRAM_BOT_TOKEN) {
             const errorMessage = `🚧 Произошла внутренняя ошибка сервера.\n\nТехнические детали:\n${e.message}`;
             try {
                await telegramApi(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
                    chat_id: chatId,
                    text: errorMessage.substring(0, 4096) // Telegram message limit
                });
             } catch (sendError) {
                 console.error("Failed to even send the error message to Telegram:", sendError);
             }
        }
    }
    
    // Always respond to Telegram with 200 OK to prevent message retries.
    return new Response('OK');
};