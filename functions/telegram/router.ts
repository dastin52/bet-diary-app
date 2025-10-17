// functions/telegram/router.ts

/**
 * Centralized callback data constants to avoid magic strings in code.
 * CB stands for CallBack.
 */
export const CB = {
    // Main Menu & Navigation
    ADD_BET: 'add_bet',
    SHOW_STATS: 'show_stats',
    SHOW_COMPETITIONS: 'show_competitions',
    SHOW_GOALS: 'show_goals',
    MANAGE_BETS: 'manage_bets',
    SHOW_AI_ANALYST: 'show_ai_analyst',
    BACK_TO_MAIN: 'back_to_main',

    // Login/Register
    LOGIN: 'login',
    REGISTER: 'register',
    
    // Bet Management (used in manageBets.ts)
    LIST_BETS: 'list_bets', // Base for pagination as well
    VIEW_BET: 'view_bet', // Prefix for view_bet:bet_id
    EDIT_BET: 'edit_bet', // Prefix for edit_bet:bet_id
    DELETE_BET: 'delete_bet', // Prefix for delete_bet:bet_id

    // Pagination (used in manageBets.ts)
    NEXT_PAGE: 'next_page', // Prefix for next_page:page_number
    PREV_PAGE: 'prev_page', // Prefix for prev_page:page_number
};
