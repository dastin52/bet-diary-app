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
    handleAuth,
    handleUnknownCommand,
    handleGetCode,
    handleManage,
} from './commands';
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';

// Унифицированный тип для всех обработчиков
export type ActionHandler = (update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) => Promise<void>;

// --- Идентификаторы для всех кнопок (Callback Data) ---
export const CB = {
    SHOW_MAIN_MENU: 'main_menu',
    SHOW_STATS: 'stats',
    ADD_BET: 'add_bet',
    SHOW_COMPETITIONS: 'competitions',
    SHOW_GOALS: 'goals',
    MANAGE_BETS: 'manage_bets',
    SHOW_AI_ANALYST: 'ai_analyst',
};

// Карта маршрутов для аутентифицированных пользователей
export const authenticatedRoutes: Record<string, ActionHandler> = {
    // Текстовые команды
    '/start': handleStart,
    '/menu': handleStart, // Алиас
    '/add': handleAddBet, // Алиас
    '/addbet': handleAddBet,
    '/stats': handleStats,
    '/manage': handleManage,
    '/getcode': handleGetCode,
    '/reset': handleReset,
    '/help': handleHelp,

    // Нажатия на кнопки (callback_data)
    [CB.SHOW_MAIN_MENU]: handleStart,
    [CB.SHOW_STATS]: handleStats,
    [CB.ADD_BET]: handleAddBet,
    [CB.SHOW_COMPETITIONS]: handleCompetitions,
    [CB.SHOW_GOALS]: handleGoals,
    [CB.MANAGE_BETS]: handleManageBets,
    [CB.SHOW_AI_ANALYST]: handleAiAnalyst,
};

// Карта маршрутов для неаутентифицированных пользователей
export const unauthenticatedRoutes: Record<string, ActionHandler> = {
    '/start': handleStart,
    '/help': handleHelp,
    '/reset': handleReset,
};
