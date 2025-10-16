// functions/telegram/telegramApi.ts
import { Env } from './types';

async function apiRequest(method: string, token: string, body: object) {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorBody = await response.json().catch(() => response.text());
        console.error(`Telegram API Error: ${method} failed with status ${response.status}`, errorBody);
        throw new Error(`Telegram API Error: ${method} failed with status ${response.status}. Response: ${JSON.stringify(errorBody)}`);
    }
    return response.json();
}

export async function sendMessage(chatId: number, text: string, env: Env, reply_markup?: object) {
    const payload: any = { chat_id: chatId, text, parse_mode: 'Markdown' };
    if (reply_markup) {
        payload.reply_markup = reply_markup;
    }
    return apiRequest('sendMessage', env.TELEGRAM_BOT_TOKEN, payload);
}

export async function editMessageText(chatId: number, messageId: number, text: string, env: Env, reply_markup?: object) {
    const payload: any = { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' };
     if (reply_markup) {
        payload.reply_markup = reply_markup;
    }
    return apiRequest('editMessageText', env.TELEGRAM_BOT_TOKEN, payload);
}

export async function deleteMessage(chatId: number, messageId: number, env: Env) {
    return apiRequest('deleteMessage', env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId, message_id: messageId
    });
}

export async function answerCallbackQuery(callbackQueryId: string, env: Env, text?: string) {
    return apiRequest('answerCallbackQuery', env.TELEGRAM_BOT_TOKEN, {
        callback_query_id: callbackQueryId, text,
    });
}

export async function reportError(chatId: number, env: Env, context: string, error: any) {
    const errorText = error instanceof Error ? error.stack : JSON.stringify(error);
    console.error(`Error in ${context} for chat ${chatId}:`, errorText);
    const errorMessage = `🐞 *Произошла ошибка!*\n\nКонтекст: \`${context}\`\n\nПожалуйста, попробуйте снова. Если ошибка повторяется, используйте /reset.`;
    try {
        await sendMessage(chatId, errorMessage, env);
    } catch (sendError) {
        console.error(`FATAL: Could not send error report to chat ${chatId}:`, sendError);
    }
}
