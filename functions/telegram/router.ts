// functions/telegram/router.ts

/**
 * Shortened prefix for all bet management callbacks to save space.
 */
export const MANAGE_PREFIX = 'm';

/**
 * Shortened keys for all actions within the manage module.
 */
export const MANAGE_ACTIONS = {
    LIST: 'l',
    VIEW: 'v',
    PROMPT_STATUS: 'ps',
    SET_STATUS: 'ss',
    PROMPT_DELETE: 'pd',
    CONFIRM_DELETE: 'cd',
};


/**
 * Defines static callback data strings for main menu buttons and simple actions.
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
 * Builds a compact callback data string for the bet management module.
 * Example: buildManageCb('v', 'bet-123', 0) -> "m|v|bet-123|0"
 * @param action - The short action key from MANAGE_ACTIONS.
 * @param args - The parts of the callback data.
 * @returns A formatted, compact string.
 */
export function buildManageCb(action: string, ...args: (string | number)[]): string {
    return [MANAGE_PREFIX, action, ...args].join('|');
}
