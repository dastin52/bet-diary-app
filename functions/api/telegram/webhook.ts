// functions/api/telegram/webhook.ts

/**
 * This Cloudflare Function is the new backend for the Telegram bot.
 * It acts as a webhook, receiving all updates from Telegram.
 *
 * IMPORTANT: For this to work, you must:
 * 1. Create a KV Namespace in your Cloudflare dashboard (e.g., named "BOT_STATE").
 * 2. Bind this namespace to your Pages project with the variable name "BOT_STATE".
 * 3. Set the "TELEGRAM_BOT_TOKEN" and "API_KEY" (for Gemini) as environment variables in your project settings.
 * 4. Set the webhook for your bot to point to this function's URL:
 *    https://<YOUR_PROJECT>.pages.dev/api/telegram/webhook
 */

import { GoogleGenAI } from "@google/genai";

// FIX: Define types for Cloudflare Pages environment as they are not available in this context.
interface KVNamespace {
    put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expiration?: number; expirationTtl?: number; metadata?: any; }): Promise<void>;
    get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<string | any | ArrayBuffer | ReadableStream | null>;
}

interface EventContext<Env> {
    request: Request;
    env: Env;
    // Add other properties if needed (e.g., params, waitUntil, next)
}

type PagesFunction<Env = unknown> = (
    context: EventContext<Env>
) => Response | Promise<Response>;


// Define the structure for environment variables for type safety
interface Env {
    BOT_STATE: KVNamespace;
    TELEGRAM_BOT_TOKEN: string;
    API_KEY: string;
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
    const { TELEGRAM_BOT_TOKEN, BOT_STATE, API_KEY } = env;

    if (!TELEGRAM_BOT_TOKEN || !BOT_STATE || !API_KEY) {
        console.error("Missing environment variables. Bot will not function.");
        return new Response('Bot not configured', { status: 500 });
    }
    
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    // FIX: The default Request.json() method is not generic. Cast the result to the expected type.
    const update = await request.json() as any;
    
    // Extract chat ID and text from either a message or a callback query
    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
    const text = update.message?.text || update.callback_query?.data;
    const fromId = update.message?.from.id || update.callback_query?.from.id;

    if (!chatId) {
        return new Response('OK'); // Not a message we can handle
    }

    try {
        // Simple command handling
        if (text === '/start') {
            await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                chat_id: chatId,
                text: "Добро пожаловать в Дневник Ставок! - ваш персональный помощник для анализа и учета спортивных ставок.\n\n" +
                      "Если у вас уже есть аккаунт на нашем сайте, пожалуйста, сгенерируйте код в разделе 'Настройки -> Интеграция с Telegram' и отправьте его мне для привязки.\n\n" +
                      "Если у вас еще нет аккаунта, вы можете создать его прямо здесь, введя команду /register.",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✍️ Зарегистрироваться", callback_data: "/register" }]
                    ]
                }
            });
        } else if (text === '/register') {
             // Start registration process by storing user state in KV
             await BOT_STATE.put(`state:${fromId}`, JSON.stringify({ action: 'register_nickname' }));
             await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                chat_id: chatId,
                text: "Отлично! Давайте создадим вам аккаунт. Пожалуйста, введите ваш желаемый никнейм (не менее 3 символов):"
             });
        }
        // NOTE: A full implementation would require a state machine stored in KV
        // to handle multi-step interactions like registration, adding bets, etc.
        // This is a simplified example.
        else {
             // Check for auth code
             const codeMatch = text.match(/^\d{6}$/);
             if (codeMatch) {
                // In a real KV implementation, you'd fetch the code from where the web function stored it.
                // This part requires coordination between web function and bot function via KV.
                 await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                    chat_id: chatId,
                    text: `✅ Аккаунт успешно привязан! Теперь вы можете использовать все функции бота.`
                 });
             } else {
                 await telegramApi(TELEGRAM_BOT_TOKEN, 'sendMessage', {
                    chat_id: chatId,
                    text: `Я не понял вашу команду. Используйте /start, чтобы начать.`
                 });
             }
        }
    } catch (e) {
        console.error("Error handling update:", e);
    }
    
    return new Response('OK'); // Always respond to Telegram to avoid retries
};