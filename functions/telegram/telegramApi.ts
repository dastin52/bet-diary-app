// functions/telegram/telegramApi.ts
import { Env } from './types';

async function callTelegramApi(method: string, token: string, body: object) {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Telegram API error for method ${method}: ${response.status} ${response.statusText}`, errorBody);
        throw new Error(`Telegram API error: ${response.statusText}`);
    }
    return response.json();
}

export async function sendMessage(chatId: number, text: string, env: Env, reply_markup?: object) {
    return callTelegramApi('sendMessage', env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup,
    });
}

export async function editMessageText(chatId: number, messageId: number, text: string, env: Env, reply_markup?: object) {
    return callTelegramApi('editMessageText', env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown',
        reply_markup,
    });
}

export async function answerCallbackQuery(callbackQueryId: string, env: Env, text?: string) {
    return callTelegramApi('answerCallbackQuery', env.TELEGRAM_BOT_TOKEN, {
        callback_query_id: callbackQueryId,
        text,
    });
}

export async function reportError(chatId: number, env: Env, context: string, error: any) {
    const errorMessage = `🐞 *Произошла ошибка!*
    
Контекст: \`${context}\`
    
К сожалению, бот столкнулся с непредвиденной проблемой. Пожалуйста, попробуйте снова позже. Если ошибка повторяется, вы можете использовать команду /reset.`;
    
    console.error(`Error in ${context} for chat ${chatId}:`, error instanceof Error ? error.stack : JSON.stringify(error));

    try {
        await sendMessage(chatId, errorMessage, env);
    } catch (sendError) {
        console.error(`Failed to send error report to chat ${chatId}:`, sendError);
    }
}
