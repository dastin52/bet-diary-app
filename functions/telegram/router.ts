// functions/telegram/router.ts
import {
    handleStart,
    handleAddBet,
    handleStats,
    handleCompetitions,
    handleGoals,
    handleAiAnalyst,
    handleManageBets,
    handleHelp,
    handleReset,
    handleManage,
    handleGetCode,
    handleRegister,
    handleLogin,
} from './commands';
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';

export type ActionHandler = (update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) => Promise<void>;

// Standardized callback data keys for type safety and consistency
export const CB = {
    SHOW_MAIN_MENU: 'main_menu',
    SHOW_STATS: 'stats',
    ADD_BET: 'add_bet',
    SHOW_COMPETITIONS: 'competitions',
    SHOW_GOALS: 'goals',
    MANAGE_BETS: 'manage_bets',
    SHOW_AI_ANALYST: 'ai_analyst',
    REGISTER: 'register',
    LOGIN: 'login',
};

// These commands should always work and will interrupt any active dialog.
export const globalRoutes: Record<string, ActionHandler> = {
    '/start': handleStart,
    '/menu': handleStart,
    '/help': handleHelp,
    '/reset': handleReset,
};

// Routes available only when the user is authenticated.
export const authenticatedRoutes: Record<string, ActionHandler> = {
    // Commands
    '/add': handleAddBet,
    '/addbet': handleAddBet,
    '/stats': handleStats,
    '/manage': handleManage,
    '/getcode': handleGetCode,

    // Callbacks from buttons
    [CB.SHOW_MAIN_MENU]: handleStart,
    [CB.SHOW_STATS]: handleStats,
    [CB.ADD_BET]: handleAddBet,
    [CB.SHOW_COMPETITIONS]: handleCompetitions,
    [CB.SHOW_GOALS]: handleGoals,
    [CB.MANAGE_BETS]: handleManageBets,
    [CB.SHOW_AI_ANALYST]: handleAiAnalyst,
};

// Routes available only when the user is NOT authenticated.
// Global routes also apply.
export const unauthenticatedRoutes: Record<string, ActionHandler> = {
    // No specific commands here, they are handled by globalRoutes
};

// Callback routes for buttons that start dialogs, only for non-authenticated users.
export const unauthenticatedDialogRoutes: Record<string, ActionHandler> = {
    [CB.REGISTER]: handleRegister,
    [CB.LOGIN]: handleLogin,
};
