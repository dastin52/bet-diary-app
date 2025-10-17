// functions/telegram/handler.ts
import { handleCallbackQuery, handleMessage } from './handlers';
import { reportError } from './telegramApi';
import { Env, TelegramUpdate } from './types';

export async function handleRequest(request: Request, env: Env): Promise<Response> {
    let chatId: number | undefined;
    try {
        // Essential environment variable check
        if (!env.TELEGRAM_BOT_TOKEN || !env.GEMINI_API_KEY || !env.BOT_STATE) {
            console.error("FATAL: Missing one or more environment variables (TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, BOT_STATE).");
            // We can't report this to the user as we don't have a token, so we log and exit.
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

        // Always return OK to Telegram, errors are handled internally
        return new Response('OK', { status: 200 });
    } catch (error) {
        // This is the global catch-all. If anything fails catastrophically, we report it.
        if (chatId && env.TELEGRAM_BOT_TOKEN) {
            await reportError(chatId, env, 'Global Request Handler', error);
        } else {
            // If we don't even have a chat ID, we can only log it.
            console.error("Catastrophic error in global handler (chatId unavailable or fatal config issue):", error);
        }
        // Even in case of a catastrophic error, tell Telegram we received the update.
        return new Response('Error handled', { status: 200 });
    }
}
