// functions/telegram/types.ts

// --- Shared Data Models (from src/types.ts) ---

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

export interface User {
  email: string;
  nickname: string;
  password_hash: string;
  registeredAt: string;
  referralCode: string;
  buttercups: number;
  status: 'active' | 'blocked';
  telegramId?: number;
  telegramUsername?: string;
  source?: 'web' | 'telegram';
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

export interface Challenge {
  id: string;
  title: string;
  description: string;
  metric: 'biggest_win' | 'highest_roi' | 'most_bets' | 'highest_parlay_odds';
  period: 'weekly';
}

export type Message = {
  role: 'user' | 'model';
  parts: { text: string }[];
};


// --- Telegram & Serverless Specific Types ---

export interface KVNamespace {
    get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | any | ArrayBuffer | ReadableStream | null>;
    put(key: string, value: string | ArrayBuffer | ReadableStream | ArrayBufferView, options?: { expirationTtl?: number; metadata?: any; }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string; expiration?: number; metadata?: any; }[]; list_complete: boolean; cursor?: string; }>;
}

export interface Env {
    TELEGRAM_BOT_TOKEN: string;
    GEMINI_API_KEY: string;
    BOT_STATE: KVNamespace;
    SPORT_API_KEY?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: { file_id: string, width: number, height: number }[];
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message: TelegramMessage;
  data: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface DialogState {
  name: string;
  step: string;
  data: any;
  messageId?: number;
}

export interface UserState {
  user: User | null;
  bets: Bet[];
  bankroll: number;
  goals: Goal[];
  bankHistory: BankTransaction[];
  dialog: DialogState | null;
}

export interface CompetitionParticipant {
    user: {
        nickname: string;
        email: string;
    };
    stats: {
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
    };
}

export interface AIParsedBetData {
    sport: string;
    legs: BetLeg[];
    stake: number;
    odds: number;
    bookmaker: string;
    betType: BetType;
    status?: BetStatus;
}


// --- Sports API Types ---
export interface HockeyTeam {
    id: number;
    name: string;
    logo: string;
}
export interface HockeyLeague {
    id: number;
    name: string;
    country: string;
    logo: string;
    season: number;
}
export interface HockeyGame {
    id: number;
    date: string;
    time: string;
    timestamp: number;
    timezone: string;
    league: HockeyLeague;
    teams: {
        home: HockeyTeam;
        away: HockeyTeam;
    };
}
export interface HockeyApiResponse {
    response: HockeyGame[];
    errors?: any;
}
