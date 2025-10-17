// functions/telegram/router.ts

/**
 * Prefix for all callback data related to the bet management module.
 */
export const MANAGE_PREFIX = 'manage';

/**
 * Defines static callback data strings for main menu buttons and simple actions.
 * Using an object over an enum for easier string manipulation.
 */
export const CB = {
    // Main Menu
    ADD_BET: 'add_bet',
    SHOW_STATS: 'show_stats',
    SHOW_COMPETITIONS: 'show_competitions',
    SHOW_GOALS: 'show_goals',
    MANAGE_BETS: MANAGE_PREFIX, // The entry point to the manage module is just the prefix
    SHOW_AI_ANALYST: 'show_ai_analyst',
    
    // Auth
    LOGIN: 'login',
    REGISTER: 'register',

    // Navigation
    BACK_TO_MAIN: 'back_to_main',
};

/**
 * Builds a callback data string for the bet management module.
 * Joins arguments with a '|' separator.
 * Example: buildManageCb('view', 'bet-123', 0) -> "manage|view|bet-123|0"
 * @param args - The parts of the callback data.
 * @returns A formatted string.
 */
export function buildManageCb(...args: (string | number)[]): string {
    return [MANAGE_PREFIX, ...args].join('|');
}
