// functions/telegram/goals.ts
import { TelegramCallbackQuery, TelegramUpdate, UserState, Env, Goal, GoalMetric, GoalStatus } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { startAddGoalDialog } from './dialogs';
import { updateAndSyncState, deleteGoalFromState } from './state';
import { getGoalProgress } from '../utils/goalUtils';

export const GOAL_PREFIX = 'g|';
export const GOAL_ACTIONS = {
    LIST: 'list',
    ADD: 'add',
    PROMPT_DELETE: 'p_del',
    CONFIRM_DELETE: 'c_del',
};
export const buildGoalCb = (action: string, ...args: (string | number)[]): string => `${GOAL_PREFIX}${action}|${args.join('|')}`;

const GOALS_PER_PAGE = 3;

export async function startManageGoals(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const messageId = update.callback_query ? message.message_id : null;
    await showGoalsList(message.chat.id, messageId, state, env, 0);
}

async function showGoalsList(chatId: number, messageId: number | null, state: UserState, env: Env, page: number) {
    const goals = state.goals;
    const totalGoals = goals.length;
    let text = '*🎯 Мои Цели*\n\n';

    const keyboard_options = [];

    if (totalGoals > 0) {
        const totalPages = Math.ceil(totalGoals / GOALS_PER_PAGE);
        const currentPage = Math.max(0, Math.min(page, totalPages - 1));
        
        const start = currentPage * GOALS_PER_PAGE;
        const end = start + GOALS_PER_PAGE;
        const goalsOnPage = goals.slice(start, end);

        if (goalsOnPage.length > 0) {
            goalsOnPage.forEach(goal => {
                const { percentage, label } = getGoalProgress(goal);
                const statusEmoji = goal.status === GoalStatus.Achieved ? '✅' : goal.status === GoalStatus.Failed ? '❌' : '⏳';
                text += `${statusEmoji} *${goal.title}*\n`;
                text += `_${label} (${percentage.toFixed(1)}%)_\n\n`;
            });
        } else {
             text += '_У вас пока нет целей. Давайте создадим первую!_\n';
        }

        const navButtons = [];
        if (currentPage > 0) navButtons.push({ text: '⬅️ Пред.', callback_data: buildGoalCb(GOAL_ACTIONS.LIST, currentPage - 1)});
        if (currentPage < totalPages - 1) navButtons.push({ text: 'След. ➡️', callback_data: buildGoalCb(GOAL_ACTIONS.LIST, currentPage + 1)});
        if(navButtons.length > 0) keyboard_options.push(navButtons);

        const deleteButtons = goalsOnPage.map((goal, i) => ({ text: `🗑️ #${start + i + 1}`, callback_data: buildGoalCb(GOAL_ACTIONS.PROMPT_DELETE, goal.id, page) }));
        if (deleteButtons.length > 0) keyboard_options.push(deleteButtons);

    } else {
        text += '_У вас пока нет целей. Давайте создадим первую!_\n';
    }
    
    keyboard_options.push([
        { text: '➕ Новая цель', callback_data: buildGoalCb(GOAL_ACTIONS.ADD) },
        { text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }
    ]);
    
    const keyboard = makeKeyboard(keyboard_options);
    
    if (messageId) {
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

async function showDeletePrompt(chatId: number, messageId: number, goalId: string, page: number, env: Env) {
    const text = 'Вы уверены, что хотите удалить эту цель?';
    const keyboard = makeKeyboard([
        [
            { text: '🗑️ Да, удалить', callback_data: buildGoalCb(GOAL_ACTIONS.CONFIRM_DELETE, goalId, page) },
            { text: '◀️ Отмена', callback_data: buildGoalCb(GOAL_ACTIONS.LIST, page) },
        ]
    ]);
    await editMessageText(chatId, messageId, text, env, keyboard);
}

export async function handleGoalCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const [_, action, ...args] = callbackQuery.data.split('|');
    const page = parseInt(args[args.length - 1]) || 0;

    switch (action) {
        case GOAL_ACTIONS.LIST:
            await showGoalsList(chatId, messageId, state, env, page);
            break;
        case GOAL_ACTIONS.ADD:
            await startAddGoalDialog(chatId, state, env, messageId);
            break;
        case GOAL_ACTIONS.PROMPT_DELETE:
            const goalIdToDelete = args[0];
            await showDeletePrompt(chatId, messageId, goalIdToDelete, page, env);
            break;
        case GOAL_ACTIONS.CONFIRM_DELETE:
            const goalId = args[0];
            const newState = deleteGoalFromState(state, goalId);
            await updateAndSyncState(chatId, newState, env);
            await sendMessage(chatId, 'Цель удалена.', env);
            await showGoalsList(chatId, messageId, newState, env, page);
            break;
    }
}
