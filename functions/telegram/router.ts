
// functions/telegram/router.ts

// CB stands for CallBack data
export const CB = {
    // Main Menu
    SHOW_STATS: 'main_stats',
    ADD_BET: 'main_add_bet',
    SHOW_COMPETITIONS: 'main_competitions',
    SHOW_GOALS: 'main_goals',
    MANAGE_BETS: 'main_manage_bets',
    SHOW_AI_ANALYST: 'main_ai_analyst',
    BACK_TO_MENU: 'main_back',

    // Auth
    LOGIN: 'auth_login',
    REGISTER: 'auth_register',
    
    // Manage Bets
    BETS_PAGE: (page: number) => `bets_page_${page}`,
    VIEW_BET: (betId: string) => `bet_view_${betId}`,
    SET_STATUS_PROMPT: (betId: string) => `bet_status_prompt_${betId}`,
    SET_STATUS: (betId: string, status: string) => `bet_status_set_${betId}_${status}`,
    BACK_TO_BETS: (page: number) => `bets_back_${page}`,

    // No-op for empty buttons or placeholders
    NOOP: 'noop',
};
