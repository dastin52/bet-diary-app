// functions/telegram/types.ts

// --- Core App Types (now self-contained) ---
export enum BetStatus {
  Pending = 'pending', Won = 'won', Lost = 'lost', Void = 'void', CashedOut = 'cashed_out',
}
export enum BetType {
  Single = 'single', Parlay = 'parlay', System = 'system',
}
export interface BetLeg {
  homeTeam: string; awayTeam: string; market: string;
}
export interface Bet {
  id: string; createdAt: string; event: string; legs: BetLeg[]; sport: string; bookmaker: string;
  betType: BetType; stake: number; odds: number; status: BetStatus; profit?: number;
  notes?: string; tags?: string[];
}
export enum BankTransactionType {
  Deposit = 'deposit', Withdrawal = 'withdrawal', BetWin = 'bet_win', BetLoss = 'bet_loss',
  BetVoid = 'bet_void', BetCashout = 'bet_cashout', Correction = 'correction',
}
export interface BankTransaction {
  id: string; timestamp: string; type: BankTransactionType; amount: number;
  previousBalance: number; newBalance: number; description: string; betId?: string;
}
export interface User {
  email: string; nickname: string; password_hash: string; registeredAt: string;
  referralCode: string; buttercups: number; status: 'active' | 'blocked';
}
export interface Goal {
    id: string;
    title: string;
    metric: GoalMetric;
    targetValue: number;
    currentValue: number;
    status: GoalStatus;
    createdAt: string;
    deadline: string;
    scope: {
        type: 'sport' | 'betType' | 'tag' | 'all';
        value?: string;
    };
}
export interface Challenge { id: string; title: string; description: string; metric: string; period: string; }
export enum GoalMetric {
    Profit = 'profit', ROI = 'roi', WinRate = 'win_rate', BetCount = 'bet_count'
}
export enum GoalStatus {
    InProgress = 'in_progress', Achieved = 'achieved', Failed = 'failed'
}
export type Message = {
  role: 'user' | 'model';
  text: string;
};


// --- Bot-specific Types ---

export interface Env {
    TELEGRAM_BOT_TOKEN: string;
    GEMINI_API_KEY: string;
    BOT_STATE: KVNamespace;
}

export interface KVNamespace {
    get<T>(key: string, type: 'json'): Promise<T | null>;
    get(key: string): Promise<string | null>;
    put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[], list_complete: boolean, cursor?: string }>;
}

export interface Dialog {
    type: 'add_bet' | 'register' | 'login' | 'ai_chat';
    step: string;
    messageId?: number;
    data: { [key: string]: any };
}

export interface UserBetData {
  bets: Bet[]; bankroll: number; goals: Goal[]; bankHistory: BankTransaction[];
}

export interface UserState extends UserBetData {
    user: User | null;
    dialog: Dialog | null;
}

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
