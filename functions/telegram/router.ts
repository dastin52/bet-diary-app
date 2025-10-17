// functions/telegram/router.ts
export const MANAGE_PREFIX = 'manage';

export const MANAGE_ACTIONS = {
    LIST: 'list',
    VIEW: 'view',
    PROMPT_STATUS: 'p_status',
    SET_STATUS: 's_status',
    PROMPT_DELETE: 'p_delete',
    CONFIRM_DELETE: 'c_delete',
};

// Helper function needs to be defined before being used in CB
export function buildManageCb(...args: (string | number)[]): string {
    return [MANAGE_PREFIX, ...args].join('|');
}

export const CB = {
    BACK_TO_MAIN: 'main_menu',
    SHOW_STATS: 'show_stats',
    ADD_BET: 'add_bet',
    SHOW_COMPETITIONS: 'show_competitions',
    SHOW_GOALS: 'show_goals',
    MANAGE_BETS: buildManageCb(MANAGE_ACTIONS.LIST, '0'),
    SHOW_AI_ANALYST: 'show_ai',
    LOGIN: 'login',
    REGISTER: 'register',
};
