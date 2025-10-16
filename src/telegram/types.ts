// src/telegram/types.ts
import { User, Bet, Goal, BankTransaction } from '../types';
import { UserBetData } from '../data/betStore';

// Re-export core types for convenience within the Telegram module
export * from '../types';
export type { UserBetData } from '../data/betStore';

// --- Environment & State ---

export interface Env {
    TELEGRAM_BOT_TOKEN: string;
    GEMINI_API_KEY: string;
    BOT_STATE: KVNamespace;
    // This will be added by our enhancer function
    TELEGRAM: {
        sendMessage(payload: object): Promise<any>;
        editMessageText(payload: object): Promise<any>;
        answerCallbackQuery(payload: object): Promise<any>;
    };
}

export interface KVNamespace {
    get(key: string, options?: { type?: "text" | "json" | "arrayBuffer" | "stream" }): Promise<string | any | null>;
    put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[], list_complete: boolean, cursor?: string }>;
}

export interface DialogState {
    step: string;
    messageId?: number; // The message to edit during the dialog
    data: { [key: string]: any };
}

export interface UserState extends UserBetData {
    user: User | null;
    dialog: DialogState | null;
}


// --- Telegram API Structures ---

export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
    message_id: number;
    from: TelegramUser;
    chat: { id: number; };
    date: number;
    text?: string;
}

export interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    message: TelegramMessage;
    data: string;
}

export interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
}
