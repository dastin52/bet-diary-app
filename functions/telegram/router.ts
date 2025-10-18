// functions/telegram/router.ts
import { TelegramUpdate, UserState, Env } from './types';
import { answerCallbackQuery, sendMessage } from './telegramApi';
import { showMainMenu } from './ui';
import { handleStats, handleAddBet, handleManageBets, handleCompetitions, handleGoals, handleAiChat, showLinkAccountInfo } from './commands';
import { manageBets, MANAGE_PREFIX } from './manageBets';
import { handleCompetitionCallback, COMP_PREFIX } from './competition';
import { handleGoalCallback, GOAL_PREFIX } from './goals';

// Callback Data constants
export const CB = {
    BACK_TO_MAIN: 'main_menu',
    SHOW_STATS: 'show_stats',
    ADD_BET: 'add_bet',
    MANAGE_BETS: 'manage_bets',
    COMPETITIONS: 'competitions',
    GOALS: 'goals',
    AI_CHAT: 'ai_chat',
    AI_GET_TEMPLATE: 'ai_get_template',
    SHOW_DETAILED_ANALYTICS: 'stats_detailed',
    DOWNLOAD_ANALYTICS_REPORT: 'stats_download',
    START_REGISTER: 'start_register',
    START_LOGIN: 'start_login',
    SHOW_LINK_INFO: 'show_link_info',
};

const MATCH_ANALYSIS_TEMPLATE = "Проанализируй матч: [Матч] - [Турнир].\nВид спорта: [Вид спорта].\nДАТА МАТЧА: [ДД.ММ.ГГГГ].\nДАТА АНАЛИЗА: Используй текущую системную дату.\nКоманда 1: [Название 1]. Последние 5:\n[Результаты]. Травмы/Новости: [Данные].\nКоманда 2: [Название 2]. Последние 5:\n[Результаты]. Травмы/Новости: [Данные].\nОчные встречи (5 последних) :\n[Результаты]. Стиль игры: [Команда 1] vs [Команда 2].\nФакторы: [Погода, Судья, Усталость].\nНа основе текущей даты и всех предоставленных данных, создай комплексный анализ, включающий тактический прогноз, три вероятных сценария и итоговую рекомендацию на матч. Учти любые изменения в составах или новостной фон, произошедшие после последних матчей команд.";


export async function routeCallbackQuery(update: TelegramUpdate, state: UserState, env: Env) {
    const callbackQuery = update.callback_query;
    if (!callbackQuery || !callbackQuery.data) return;

    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    // Answer the callback query immediately to remove the "loading" state on the button
    await answerCallbackQuery(callbackQuery.id, env);

    const data = callbackQuery.data;

    // Prefix-based routing for modules
    if (data.startsWith(MANAGE_PREFIX)) {
        await manageBets(callbackQuery, state, env);
        return;
    }
    if (data.startsWith(COMP_PREFIX)) {
        await handleCompetitionCallback(update, state, env);
        return;
    }
    if (data.startsWith(GOAL_PREFIX)) {
        await handleGoalCallback(callbackQuery, state, env);
        return;
    }

    // General routing
    switch (data) {
        case CB.BACK_TO_MAIN:
            await showMainMenu(chatId, messageId, env);
            break;
        case CB.SHOW_STATS:
        case CB.SHOW_DETAILED_ANALYTICS:
        case CB.DOWNLOAD_ANALYTICS_REPORT:
            await handleStats(update, state, env);
            break;
        case CB.ADD_BET:
            await handleAddBet(update, state, env);
            break;
        case CB.MANAGE_BETS:
            await handleManageBets(update, state, env);
            break;
        case CB.COMPETITIONS:
            await handleCompetitions(update, state, env);
            break;
        case CB.GOALS:
            await handleGoals(update, state, env);
            break;
        case CB.AI_CHAT:
            await handleAiChat(update, state, env);
            break;
        case CB.AI_GET_TEMPLATE:
            await sendMessage(chatId, `\`\`\`\n${MATCH_ANALYSIS_TEMPLATE}\n\`\`\``, env);
            break;
        case CB.SHOW_LINK_INFO:
            await showLinkAccountInfo(chatId, messageId, env);
            break;
        // Cases for registration/login dialogs would go here if they were callback-driven
        // For now they are part of the /start command flow and dialog handler
        default:
            console.warn(`Unhandled callback query data: ${data}`);
            break;
    }
}