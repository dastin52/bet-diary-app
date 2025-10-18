
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
  event: string; // This will now be a summary string generated from legs
  legs: BetLeg[]; // The structured data for the bet
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
  // NOTE: In a real application, NEVER store plain text passwords.
  // This should be a securely hashed password managed by a backend server.
  password_hash: string;
  registeredAt: string;
  referralCode: string;
  buttercups: number;
  status: 'active' | 'blocked';
  telegramId?: number;
  telegramUsername?: string;
}

export interface ChatMessage {
    id: string;
    userNickname: string;
    userEmail: string; // To identify the user, maybe for avatars later
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
    scope: { // Optional filter for the goal
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

export enum AIPredictionStatus {
    Pending = 'pending',
    Correct = 'correct',
    Incorrect = 'incorrect',
}

export interface AIPrediction {
    id: string;
    createdAt: string;
    sport: string;
    matchName: string;
    prediction: string;
    status: AIPredictionStatus;
}
