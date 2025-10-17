// functions/telegram/types.ts
import { User, Bet, Goal, BankTransaction, Achievement } from '../../src/types';
import { UserBetData } from '../../src/data/betStore';

// Re-export core types for convenience within the Telegram module
export * from '../../src/types';
export type { UserBetData } from '../../src/data/betStore';

// --- Environment & State ---

export interface Env {
    TELEGRAM_BOT_TOKEN: string;
    GEMINI_API_KEY: string;
    BOT_STATE: KVNamespace;
}

export interface KVNamespace {
    get(key: string, options?: { type?: "text" | "json" | "arrayBuffer" | "stream" }): Promise<string | any | null>;
    put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

export interface DialogState {
    type: 'add_bet' | 'register' | 'login' | 'ai_chat';
    step: string;
    messageId?: number; 
    data: { [key: string]: any };
}

export interface UserState extends UserBetData {
    user: User | null;
    dialog: DialogState | null;
}

// FIX: Add missing types for competition data.
export interface ParticipantStats {
    rank: number;
    roi: number;
    totalBets: number;
    wonBets: number;
    lostBets: number;
    biggestWin: number;
    biggestLoss: number;
    totalStaked: number;
    totalProfit: number;
    achievements: Achievement[];
}

export interface CompetitionParticipant {
    user: {
        nickname: string;
        email: string;
    };
    stats: ParticipantStats;
}


// --- Telegram API Structures ---
export type TelegramUpdate = { message: TelegramMessage } | { callbackQuery: TelegramCallbackQuery };

export interface TelegramUpdatePayload {
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