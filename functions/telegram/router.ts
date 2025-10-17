// functions/telegram/router.ts

export const CB = {
    // Main Menu
    SHOW_STATS: 'stats',
    ADD_BET: 'add_bet',
    SHOW_COMPETITIONS: 'competitions',
    SHOW_GOALS: 'goals',
    MANAGE_BETS: 'manage_bets',
    SHOW_AI_ANALYST: 'ai_analyst',
    BACK_TO_MAIN: 'main_menu',

    // Auth
    LOGIN: 'login',
    REGISTER: 'register',
};

export const MANAGE_PREFIX = 'm';

export const MANAGE_ACTIONS = {
    LIST: 'l',
    VIEW: 'v',
    PROMPT_STATUS: 'ps',
    SET_STATUS: 'ss',
    PROMPT_DELETE: 'pd',
    CONFIRM_DELETE: 'cd',
};

// Helper to build callback data strings for bet management
export const buildManageCb = (...args: (string | number)[]): string => {
    return [MANAGE_PREFIX, ...args].join('|');
};
