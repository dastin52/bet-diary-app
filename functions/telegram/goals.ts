// functions/telegram/goals.ts
import { TelegramCallbackQuery, UserState, Env, GoalStatus, Goal, TelegramUpdate } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { startAddGoalDialog } from './dialogs';
import { getGoalProgress } from '../utils/goalUtils';
import { deleteGoalFromState, setUserState } from './state';

export const GOAL_PREFIX = 'g|';
export const GOAL_ACTIONS = {
    LIST: 'list',
    START_ADD: 'start_add',
    PROMPT_DELETE: 'p_delete',
    CONFIRM_DELETE: 'c_delete',
};
export const buildGoalCb = (action: string, ...args: (string | number)[]): string => `${GOAL_PREFIX}${action}|${args.join('|')}`;

export async function startManageGoals(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const chatId = message.chat.id;
    const messageId = update.callback_query ? message.message_id : null;

    const activeGoals = state.goals.filter(g => g.status === GoalStatus.InProgress);
    const completedGoals = state.goals.filter(g => g.status !== GoalStatus.InProgress);

    let text = '*🎯 Мои Цели*\n\n';

    if (state.goals.length === 0) {
        text += 'У вас пока нет целей. Время поставить новую!';
    } else {
        if (activeGoals.length > 0) {
            text += '*Активные цели:*\n';
            activeGoals.forEach(g => {
                const { percentage, label } = getGoalProgress(g);
                text += `\n- *${g.title}* (${percentage.toFixed(0)}%)\n  _${label}_`;
            });
        }
        if (completedGoals.length > 0) {
            text += '\n\n*Архивные цели:*\n';
            completedGoals.forEach(g => {
                text += `- _${g.title}_ (${g.status === GoalStatus.Achieved ? '✅' : '❌'})\n`;
            });
        }
    }

    const goalButtons = activeGoals.map(g => ({ text: `🗑️ ${g.title.substring(0, 20)}...`, callback_data: buildGoalCb(GOAL_ACTIONS.PROMPT_DELETE, g.id) }));

    const keyboard = makeKeyboard([
        ...goalButtons.map(b => [b]), // Each button on its own row
        [{ text: '📝 Добавить новую цель', callback_data: buildGoalCb(GOAL_ACTIONS.START_ADD) }],
        [{ text: '◀️ Главное меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    if (messageId) {
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}


export async function handleGoalCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const [_, action, ...args] = callbackQuery.data.split('|');

    switch (action) {
        case GOAL_ACTIONS.START_ADD:
            await startAddGoalDialog(chatId, state, env);
            break;
        
        case GOAL_ACTIONS.PROMPT_DELETE: {
            const goalId = args[0];
            const goal = state.goals.find(g => g.id === goalId);
            if (!goal) return;
            const text = `Вы уверены, что хотите удалить цель "${goal.title}"?`;
            const keyboard = makeKeyboard([
                [{ text: '🗑️ Да, удалить', callback_data: buildGoalCb(GOAL_ACTIONS.CONFIRM_DELETE, goalId) }],
                [{ text: '◀️ Отмена', callback_data: buildGoalCb(GOAL_ACTIONS.LIST) }]
            ]);
            await editMessageText(chatId, messageId, text, env, keyboard);
            break;
        }

        case GOAL_ACTIONS.CONFIRM_DELETE: {
            const goalId = args[0];
            const newState = deleteGoalFromState(state, goalId);
            await setUserState(chatId, newState, env);
            // Sync back to main user data
            if (newState.user) {
                await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));
            }
            await sendMessage(chatId, "Цель удалена.", env);
            // Refresh the goals list
            const update: TelegramUpdate = { update_id: 0, callback_query: callbackQuery };
            await startManageGoals(update, newState, env);
            break;
        }
        
        case GOAL_ACTIONS.LIST:
        default:
             const update: TelegramUpdate = { update_id: 0, callback_query: callbackQuery };
             await startManageGoals(update, state, env);
             break;
    }
}
