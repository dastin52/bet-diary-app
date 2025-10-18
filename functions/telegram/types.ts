// functions/telegram/types.ts
import { User, Bet, Goal, BankTransaction, BetStatus, BetType, BetLeg, BankTransactionType, GroundingSource, Message, ChatMessage, Achievement, GoalMetric, GoalStatus, UserSettings, UpcomingMatch, TeamStats, Challenge, CompetitionParticipant } from '../../src/types';

// Re-export core types for convenience within the Telegram module
export * from '../../src/types';
export type { UserBetData } from '../data/betStore';

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
    type: 'add_bet' | 'ai_chat' | 'add_goal';
    step: string;
    messageId?: number; 
    data: { [key: string]: any };
}

export interface UserState {
    user: User | null;
    bets: Bet[];
    bankroll: number;
    goals: Goal[];
    bankHistory: BankTransaction[];
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
