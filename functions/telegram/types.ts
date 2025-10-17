// functions/telegram/types.ts

// --- Core Application Types (from root types.ts) ---

export enum BetStatus {
  Pending = 'pending',
  Won = 'won',
  Lost = 'lost',
  Void = 'void',
  CashedOut = 'cashed_out',
}

export enum BetType {
  Single = 'single',
  Parlay = 'parlay', // Accumulator/Express
  System = 'system',
}

export interface BetLeg {
  homeTeam: string;
  awayTeam:string;
  market: string;
}

export interface Bet {
  id: string;
  createdAt: string;
  event: string;
  legs: BetLeg[];
  sport: string;
  bookmaker: string;
  betType: BetType;
  stake: number;
  odds: number;
  status: BetStatus;
  profit?: number;
  notes?: string;
  tags?: string[];
}

export enum BankTransactionType {
  Deposit = 'deposit',
  Withdrawal = 'withdrawal',
  BetWin = 'bet_win',
  BetLoss = 'bet_loss',
  BetVoid = 'bet_void',
  BetCashout = 'bet_cashout',
  Correction = 'correction',
}

export interface BankTransaction {
  id: string;
  timestamp: string;
  type: BankTransactionType;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string;
  betId?: string;
}

export interface GroundingSource {
  web: {
    uri: string;
    title: string;
  };
}

export type Message = {
  role: 'user' | 'model';
  text: string;
  sources?: GroundingSource[];
};

export interface User {
  email: string;
  nickname: string;
  password_hash: string;
  registeredAt: string;
  referralCode: string;
  buttercups: number;
  status: 'active' | 'blocked';
}

export interface ChatMessage {
    id: string;
    userNickname: string;
    userEmail: string;
    text: string;
    timestamp: string;
}

export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
}

export enum GoalMetric {
    Profit = 'profit',
    ROI = 'roi',
    WinRate = 'win_rate',
    BetCount = 'bet_count'
}

export enum GoalStatus {
    InProgress = 'in_progress',
    Achieved = 'achieved',
    Failed = 'failed'
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

export interface UserSettings {
  notifications: {
    betReminders: boolean;
    competitionUpdates: boolean;
    aiAnalysisAlerts: boolean;
  };
  theme: 'light' | 'dark' | 'system';
}

export interface UpcomingMatch {
  sport: string;
  eventName: string;
  teams: string;
  date: string;
  time: string;
  isHotMatch: boolean;
}

export interface TeamStats {
  name: string;
  sport: string;
  betCount: number;
  winRate: number;
  totalProfit: number;
  roi: number;
  avgOdds: number;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  metric: 'biggest_win' | 'highest_roi' | 'most_bets' | 'highest_parlay_odds';
  period: 'weekly';
}

export interface CompetitionParticipant {
    user: {
        nickname: string;
        email: string;
    };
    stats: any;
}

// --- Types from data/betStore ---

export interface UserBetData {
  bets: Bet[];
  bankroll: number;
  goals: Goal[];
  bankHistory: BankTransaction[];
}

// --- Telegram Specific Types (from src/telegram/types.ts) ---

export interface Env {
    TELEGRAM_BOT_TOKEN: string;
    GEMINI_API_KEY: string;
    BOT_STATE: KVNamespace;
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
    messageId?: number;
    data: { [key: string]: any };
}

export interface UserState extends UserBetData {
    user: User | null;
    dialog: DialogState | null;
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
