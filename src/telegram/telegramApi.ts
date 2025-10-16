// src/telegram/telegramApi.ts
import { Env, UserState } from './types';

// This class wraps the raw fetch calls to the Telegram API for better type safety and error handling.
class TelegramApi {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    private async apiRequest(method: string, payload: object): Promise<any> {
        const url = `https://api.telegram.org/bot${this.token}/${method}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const responseBody = await response.json();

            if (!response.ok || !responseBody.ok) {
                console.error(`Telegram API Error: ${method} failed with status ${response.status}`, responseBody);
                throw new Error(`Telegram API Error: ${method} failed. Response: ${JSON.stringify(responseBody)}`);
            }
            return responseBody;
        } catch (error) {
            console.error(`Failed to call Telegram API method ${method}`, error);
            throw error;
        }
    }
    
    // --- Public methods for different API calls ---
    
    async sendMessage(payload: { chat_id: number; text: string; parse_mode?: string; reply_markup?: object; }): Promise<any> {
        return this.apiRequest('sendMessage', payload);
    }

    async editMessageText(payload: { chat_id: number; message_id: number; text: string; parse_mode?: string; reply_markup?: object; }): Promise<any> {
        return this.apiRequest('editMessageText', payload);
    }
    
    async answerCallbackQuery(payload: { callback_query_id: string; text?: string; }): Promise<any> {
        return this.apiRequest('answerCallbackQuery', payload);
    }
}

// --- High-Level UI Functions ---

export async function showMainMenu(chatId: number, state: UserState, env: Env, text?: string, messageId?: number) {
    const payload = {
        chat_id: chatId,
        text: text || `*Главное меню*`,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 Статистика", callback_data: "show_stats" }, { text: "➕ Добавить ставку", callback_data: "add_bet" }],
                [{ text: "🏆 Соревнования", callback_data: "show_competitions" }, { text: "🎯 Мои цели", callback_data: "show_goals" }],
                [{ text: "🤖 AI-Аналитик", callback_data: "ai_chat" }],
            ]
        }
    };
     if (messageId) {
        await env.TELEGRAM.editMessageText({ ...payload, message_id: messageId });
    } else {
        await env.TELEGRAM.sendMessage(payload);
    }
}

export async function showStartMenu(chatId: number, env: Env, text?: string, messageId?: number) {
    const payload = {
        chat_id: chatId,
        text: text || "👋 *Добро пожаловать!*\n\nПожалуйста, войдите или зарегистрируйтесь, чтобы начать.",
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "➡️ Войти", callback_data: "start_login" }],
                [{ text: "📝 Регистрация", callback_data: "start_register" }]
            ]
        }
    };
    if (messageId) {
        await env.TELEGRAM.editMessageText({ ...payload, message_id: messageId });
    } else {
        await env.TELEGRAM.sendMessage(payload);
    }
}

export async function reportError(chatId: number, env: Env, context: string, error: any) {
    console.error(`Error in ${context}:`, error);
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    try {
        await env.TELEGRAM.sendMessage({
            chat_id: chatId,
            text: `Произошла ошибка.\nКонтекст: ${context}\nСообщение: ${errorMessage.substring(0, 500)}`,
        });
    } catch (reportErr) {
        console.error("Critical: Failed to report error to user:", reportErr);
    }
}

// This function enhances the environment with a pre-configured Telegram API client.
// It should be called at the start of the request.
export function enhanceEnv(env: Env): Env {
    if (!(env as any).TELEGRAM) {
        (env as any).TELEGRAM = new TelegramApi(env.TELEGRAM_BOT_TOKEN);
    }
    return env;
}
