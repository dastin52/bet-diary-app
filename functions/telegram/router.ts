// functions/telegram/router.ts

export const CB = {
    // Main Menu
    BACK_TO_MAIN: 'main_menu',
    SHOW_STATS: 'show_stats',
    ADD_BET: 'add_bet',
    SHOW_COMPETITIONS: 'show_competitions',
    SHOW_GOALS: 'show_goals',
    MANAGE_BETS: 'manage_bets',
    SHOW_AI_ANALYST: 'show_ai_analyst',
    
    // Login
    LOGIN: 'login',
    REGISTER: 'register',

    // Stats
    GET_DETAILED_REPORT: 'get_detailed_report',
    GET_HTML_REPORT: 'get_html_report',
};

export const MANAGE_PREFIX = 'manage_bet';

export const MANAGE_ACTIONS = {
    LIST: 'list',
    VIEW: 'view',
    PROMPT_STATUS: 'prompt_status',
    SET_STATUS: 'set_status',
    PROMPT_DELETE: 'prompt_delete',
    CONFIRM_DELETE: 'confirm_delete',
};

export const buildManageCb = (...args: (string | number)[]): string => {
    return [MANAGE_PREFIX, ...args].join('|');
};
