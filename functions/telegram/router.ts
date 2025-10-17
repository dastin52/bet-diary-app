// functions/telegram/router.ts

/**
 * Helper to build consistently formatted callback data strings for bet management.
 * Format: "m|action|...args"
 * e.g., "m|v|bet-id-123|page-0"
 * e.g., "m|ss|bet-id-123|won|page-0"
 */
export function buildManageCb(...args: (string | number)[]): string {
    return [MANAGE_PREFIX, ...args].join('|');
}

// Callback Prefixes and Actions for readability
export const MANAGE_PREFIX = 'm'; // short for manage_bet

export const MANAGE_ACTIONS = {
    LIST: 'l', // list
    VIEW: 'v', // view
    PROMPT_STATUS: 'ps', // prompt_status
    SET_STATUS: 'ss', // set_status
    PROMPT_DELETE: 'pd', // prompt_delete
    CONFIRM_DELETE: 'cd', // confirm_delete
};

// Main menu callback buttons
export const CB = {
    BACK_TO_MAIN: 'main_menu',
    SHOW_STATS: 'show_stats_short',
    SHOW_STATS_DETAIL: 'show_stats_detail',
    GET_STATS_FILE: 'get_stats_file',
    ADD_BET: 'add_bet_start',
    SHOW_COMPETITIONS: 'show_competitions',
    SHOW_GOALS: 'show_goals',
    MANAGE_BETS: buildManageCb(MANAGE_ACTIONS.LIST, 0), // Entry point for bet management
    SHOW_AI_ANALYST: 'show_ai',
    LOGIN: 'login_start',
    REGISTER: 'register_start',
};
