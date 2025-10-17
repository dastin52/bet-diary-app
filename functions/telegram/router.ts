// functions/telegram/router.ts
import { 
    handleStart, handleReset, handleAddBet, handleStats, 
    handleCompetitions, handleGoals, handleManageBets, handleAiAnalyst, 
    handleRegister, handleLogin, handleHelp, handleAuth
} from './commands';

// --- Callback Data Constants ---
export const CB = {
    // Main Menu
    SHOW_STATS: 'show_stats',
    ADD_BET: 'add_bet',
    SHOW_COMPETITIONS: 'show_competitions',
    SHOW_GOALS: 'show_goals',
    MANAGE_BETS: 'manage_bets',
    SHOW_AI_ANALYST: 'show_ai',

    // Other simple actions
    BACK_TO_MAIN: 'main_menu',
    LOGIN: 'login',
    REGISTER: 'register',
};

// FIX: Export constants for the manageBets module.
export const MANAGE_PREFIX = 'manage';

export const MANAGE_ACTIONS = {
    LIST: 'l',
    VIEW: 'v',
    PROMPT_STATUS: 'ps',
    SET_STATUS: 'ss',
    PROMPT_DELETE: 'pd',
    CONFIRM_DELETE: 'cd',
};

export const buildManageCb = (...args: (string | number)[]) => [MANAGE_PREFIX, ...args].join('|');


// --- Routers ---

// Global commands can interrupt any dialog
export const globalCommandRouter: { [key: string]: Function } = {
    '/start': handleStart,
    '/menu': handleStart, 
    '/reset': handleReset,
    '/help': handleHelp,
};

// Regular commands are ignored if a dialog is active
export const commandRouter: { [key: string]: Function } = {
    '/addbet': handleAddBet,
    '/add': handleAddBet, // Alias
    '/stats': handleStats,
    '/manage': handleManageBets,
    '/auth': handleAuth, // Special case for 6-digit codes
};

// Main router for callback queries when no dialog is active
export const mainCallbackRouter: { [key: string]: Function } = {
    [CB.BACK_TO_MAIN]: handleStart,
    [CB.SHOW_STATS]: handleStats,
    [CB.ADD_BET]: handleAddBet,
    [CB.SHOW_COMPETITIONS]: handleCompetitions,
    [CB.SHOW_GOALS]: handleGoals,
    [CB.MANAGE_BETS]: handleManageBets,
    [CB.SHOW_AI_ANALYST]: handleAiAnalyst,
    [CB.LOGIN]: handleLogin,
    [CB.REGISTER]: handleRegister,
    'manage': handleManageBets, // Prefix for manage bets module
};