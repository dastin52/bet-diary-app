
// functions/telegram/handler.ts
import { handleCallbackQuery, handleMessage } from './handlers';
import { reportError } from './telegramApi';
import { Env, TelegramUpdate } from './types';

export async function handleRequest(request: Request, env: Env): Promise<Response> {
    let chatId: number | undefined;
    try {
        if (!env.TELEGRAM_BOT_TOKEN || !env.GEMINI_API_KEY || !env.BOT_STATE) {
            console.error("FATAL: Missing one or more environment variables (TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, BOT_STATE).");
            return new Response('Server configuration error', { status: 500 });
        }

        const update: TelegramUpdate = await request.json();

        if (update.callback_query) {
            chatId = update.callback_query.message.chat.id;
            await handleCallbackQuery(update.callback_query, env);
        } else if (update.message) {
            chatId = update.message.chat.id;
            await handleMessage(update.message, env);
        }

        return new Response('OK', { status: 200 });
    } catch (error) {
        if (chatId && env.TELEGRAM_BOT_TOKEN) {
            await reportError(chatId, env, 'Global Request Handler', error);
        } else {
            console.error("Catastrophic error in global handler:", error);
        }
        return new Response('Error handled', { status: 200 });
    }
}
