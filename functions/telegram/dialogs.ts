// functions/telegram/dialogs.ts
import { Bet, BetStatus, BetType, DialogState, Env, TelegramMessage, UserState, TelegramCallbackQuery, TelegramUpdate, GoalMetric } from './types';
import { setUserState, addBetToState, addGoalToState, updateAndSyncState } from './state';
import { deleteMessage, editMessageText, sendMessage } from './telegramApi';
import { BOOKMAKERS, SPORTS, BET_TYPE_OPTIONS, MARKETS_BY_SPORT, COMMON_ODDS } from '../constants';
import { calculateRiskManagedStake } from '../utils/betUtils';
import { showMainMenu } from './ui';
import { reportError } from './telegramApi';
import { buildGoalCb, GOAL_ACTIONS } from './goals';

const makeKeyboard = (options: { text: string, callback_data: string }[][]) => ({ inline_keyboard: options });

const DIALOG_TYPES = {
    ADD_BET: 'add_bet',
    AI_CHAT: 'ai_chat',
    ADD_GOAL: 'add_goal',
} as const;

const STEPS = {
    // Add Bet
    BET_TYPE: 'BET_TYPE',
    SPORT: 'SPORT',
    EVENT: 'EVENT',
    OUTCOME: 'OUTCOME',
    STAKE: 'STAKE',
    ODDS: 'ODDS',
    BOOKMAKER: 'BOOKMAKER',
    CONFIRM: 'CONFIRM',
    PARLAY_ACTION: 'PARLAY_ACTION',
    // Add Goal
    GOAL_TITLE: 'GOAL_TITLE',
    GOAL_METRIC: 'GOAL_METRIC',
    GOAL_TARGET: 'GOAL_TARGET',
    GOAL_DEADLINE: 'GOAL_DEADLINE',
    GOAL_CONFIRM: 'GOAL_CONFIRM',
    // AI Chat
    CHATTING: 'CHATTING'
};

const getChatId = (update: TelegramUpdate): number | null => {
    if (update.message) return update.message.chat.id;
    if (update.callback_query) return update.callback_query.message.chat.id;
    return null;
}
const getUserInput = (update: TelegramUpdate): string => {
    if (update.message?.text) return update.message.text;
    if (update.callback_query?.data) return update.callback_query.data;
    return '';
}

export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.dialog) return;

    try {
        switch (state.dialog.type) {
            case DIALOG_TYPES.ADD_BET:
                await continueAddBetDialog(update, state, env);
                break;
            case DIALOG_TYPES.AI_CHAT:
                await continueAiChatDialog(update, state, env);
                break;
            case DIALOG_TYPES.ADD_GOAL:
                await continueAddGoalDialog(update, state, env);
                break;
        }
    } catch (error) {
        const chatId = getChatId(update);
        if (chatId) {
            await reportError(chatId, env, `Dialog (${state.dialog.type})`, error);
        }
    }
}


// --- AI Chat Dialog ---
export async function startAiChatDialog(chatId: number, state: UserState, env: Env) {
    const dialog: DialogState = { type: 'ai_chat', step: STEPS.CHATTING, data: { history: [] } };
    const text = "🤖 AI-Аналитик к вашим услугам. Задайте свой вопрос или нажмите 'Завершить сессию' для выхода.";
    const keyboard = makeKeyboard([[{ text: '❌ Завершить сессию', callback_data: 'stop_chat' }]]);
    const sentMessage = await sendMessage(chatId, text, env, keyboard);
    if (sentMessage.result) {
        dialog.messageId = sentMessage.result.message_id;
        state.dialog = dialog;
        await setUserState(chatId, state, env);
    }
}

async function continueAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update)!;
    const userInput = getUserInput(update);
    const dialog = state.dialog!;

    if (userInput === 'stop_chat' || userInput === '/stop') {
        state.dialog = null;
        await setUserState(chatId, state, env);
        if (dialog.messageId) {
            await editMessageText(chatId, dialog.messageId, 'Сессия с AI-Аналитиком завершена.', env);
        }
        await showMainMenu(chatId, null, env);
        return;
    }
    
    // This is where you would call the Gemini API
    await sendMessage(chatId, `🤖 Ответ AI на: "${userInput}"`, env);
}


// --- Add Bet Dialog ---

const getStepPrompt = (step: string): string => {
    switch(step) {
        case STEPS.SPORT: return '👇 Выберите вид спорта:';
        case STEPS.EVENT: return 'Введите событие в формате: *Команда 1 - Команда 2* (например: `Реал Мадрид - Барселона`)';
        case STEPS.OUTCOME: return 'Введите исход (например: `П1` или `Тотал > 2.5`)';
        case STEPS.BET_TYPE: return '👇 Выберите тип ставки:';
        case STEPS.STAKE: return 'Введите сумму ставки (например: `100` или `150.50`)';
        case STEPS.ODDS: return 'Введите коэффициент (например: `1.85`)';
        case STEPS.BOOKMAKER: return '👇 Выберите букмекера:';
        case STEPS.CONFIRM: return 'Всё верно?';
        case STEPS.PARLAY_ACTION: return 'Добавить еще событие в экспресс?';
        case STEPS.GOAL_TITLE: return 'Введите название цели (например, "Выйти в плюс по футболу")';
        case STEPS.GOAL_METRIC: return 'Выберите метрику для отслеживания';
        case STEPS.GOAL_TARGET: return 'Введите целевое значение (число)';
        case STEPS.GOAL_DEADLINE: return 'Введите дедлайн в формате ГГГГ-ММ-ДД';
        case STEPS.GOAL_CONFIRM: return 'Создать эту цель?';
        default: return '';
    }
};

const getAddBetDialogText = (data: DialogState['data']): string => {
    let text = '*📝 Новая ставка*\n\n';
    if(data.betType === BetType.Parlay) {
        text += data.legs.map((leg: any, i: number) => `*Событие ${i+1}:* ${leg.homeTeam || '_?_'} vs ${leg.awayTeam || '_?_'} - *${leg.market || '_?_' }*`).join('\n') + '\n\n';
    } else if (data.legs && data.legs[0]) {
        const leg = data.legs[0];
        text += `- *Событие:* ${leg.homeTeam || '_?_'} vs ${leg.awayTeam || '_?_'}\n`;
        text += `- *Исход:* ${leg.market || '_не указан_'}\n`;
    }
    text += `- *Тип:* ${data.betType ? BET_TYPE_OPTIONS.find(o => o.value === data.betType)?.label : '_не указан_'}\n`;
    text += `- *Сумма:* ${data.stake ? `${data.stake} ₽` : '_не указана_'}\n`;
    text += `- *Коэф.:* ${data.odds || '_не указан_'}\n`;
    text += `- *Букмекер:* ${data.bookmaker || '_не указан_'}\n\n`;
    
    text += getStepPrompt(data.step);
    return text;
}


export async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const dialog: DialogState = { type: DIALOG_TYPES.ADD_BET, step: STEPS.BET_TYPE, data: { legs: [] } };
    const text = 'Выберите тип ставки:';
    const keyboard = makeKeyboard([
        [{ text: 'Одиночная', callback_data: 'add_bet_single' }, { text: 'Экспресс', callback_data: 'add_bet_parlay' }],
        [{ text: '❌ Отмена', callback_data: 'cancel_dialog' }]
    ]);

    const sentMessage = await sendMessage(chatId, text, env, keyboard);

    if (sentMessage?.result) {
        dialog.messageId = sentMessage.result.message_id;
        state.dialog = dialog;
        await setUserState(chatId, state, env);
    }
}

async function continueAddBetDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update)!;
    const userInput = getUserInput(update);
    const dialog = state.dialog!;
    let keyboard;

    try {
        if (userInput === 'cancel_dialog') {
            state.dialog = null;
            await setUserState(chatId, state, env);
            await editMessageText(chatId, dialog.messageId!, "❌ Добавление ставки отменено.", env);
            await showMainMenu(chatId, null, env);
            return;
        }

        switch (dialog.step) {
            case STEPS.CONFIRM:
                if (userInput === 'dialog_confirm') {
                    const finalBetData = { ...dialog.data, status: BetStatus.Pending };
                    let newState = addBetToState(state, finalBetData as Omit<Bet, 'id'|'createdAt'|'event'>);
                    newState.dialog = null;
                    await updateAndSyncState(chatId, newState, env); // FIX: Use new sync function
                    await editMessageText(chatId, dialog.messageId!, `✅ Ставка на "${newState.bets[0].event}" успешно добавлена!`, env);
                    await showMainMenu(chatId, null, env);
                    return;
                }
            // ... other cases
        }

    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}`, env);
    }

    if (dialog.messageId) {
        await editMessageText(chatId, dialog.messageId, getAddBetDialogText(dialog.data), env, keyboard);
    }
    
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

// --- Add Goal Dialog ---

const getAddGoalDialogText = (data: DialogState['data']): string => {
    const metricLabels = { [GoalMetric.Profit]: 'Прибыль (₽)', [GoalMetric.ROI]: 'ROI (%)', [GoalMetric.WinRate]: 'Процент побед (%)', [GoalMetric.BetCount]: 'Количество ставок' };
    let text = '*🎯 Новая цель*\n\n';
    text += `- *Название:* ${data.title || '_не указано_'}\n`;
    text += `- *Метрика:* ${data.metric ? metricLabels[data.metric as GoalMetric] : '_не указана_'}\n`;
    text += `- *Цель:* ${data.targetValue || '_не указана_'}\n`;
    text += `- *Дедлайн:* ${data.deadline || '_не указан_'}\n\n`;
    text += getStepPrompt(data.step);
    return text;
};

export async function startAddGoalDialog(chatId: number, state: UserState, env: Env) {
    const dialog: DialogState = { type: DIALOG_TYPES.ADD_GOAL, step: STEPS.GOAL_TITLE, data: {} };
    const text = getAddGoalDialogText(dialog.data);
    const sentMessage = await sendMessage(chatId, text, env);

    if (sentMessage?.result) {
        dialog.messageId = sentMessage.result.message_id;
        state.dialog = dialog;
        await setUserState(chatId, state, env);
    }
}

async function continueAddGoalDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update)!;
    const userInput = getUserInput(update);
    const dialog = state.dialog!;
    let keyboard;

    try {
        if (userInput === 'cancel_dialog') {
            state.dialog = null;
            await setUserState(chatId, state, env);
            await editMessageText(chatId, dialog.messageId!, "❌ Создание цели отменено.", env);
            const fakeCallbackQuery: TelegramCallbackQuery = { id: 'fake', from: update.callback_query!.from, message: update.callback_query!.message, data: buildGoalCb(GOAL_ACTIONS.LIST) };
            const fakeUpdate: TelegramUpdate = { update_id: 0, callback_query: fakeCallbackQuery };
            await (await import('./goals')).startManageGoals(fakeUpdate, state, env);
            return;
        }

        switch (dialog.step) {
            case STEPS.GOAL_TITLE:
                if (!userInput) return;
                dialog.data.title = userInput;
                dialog.step = STEPS.GOAL_METRIC;
                break;
            case STEPS.GOAL_METRIC:
                if (!userInput?.startsWith('goal_metric_')) return;
                dialog.data.metric = userInput.replace('goal_metric_', '');
                dialog.step = STEPS.GOAL_TARGET;
                break;
            case STEPS.GOAL_TARGET:
                if (!userInput) return;
                const target = parseFloat(userInput);
                if (isNaN(target)) throw new Error("Целевое значение должно быть числом.");
                dialog.data.targetValue = target;
                dialog.step = STEPS.GOAL_DEADLINE;
                break;
            case STEPS.GOAL_DEADLINE:
                if (!userInput || !/^\d{4}-\d{2}-\d{2}$/.test(userInput)) {
                    throw new Error("Неверный формат даты. Используйте ГГГГ-ММ-ДД.");
                }
                dialog.data.deadline = userInput;
                dialog.step = STEPS.GOAL_CONFIRM;
                break;
             case STEPS.GOAL_CONFIRM:
                if (userInput === 'goal_confirm') {
                    let newState = addGoalToState(state, dialog.data as any);
                    newState.dialog = null;
                    await updateAndSyncState(chatId, newState, env); // FIX: Use new sync function
                    await editMessageText(chatId, dialog.messageId!, `✅ Цель "${dialog.data.title}" успешно создана!`, env);
                    
                    const fakeCallbackQuery: TelegramCallbackQuery = { id: 'fake', from: update.callback_query!.from, message: update.callback_query!.message, data: buildGoalCb(GOAL_ACTIONS.LIST) };
                    const fakeUpdate: TelegramUpdate = { update_id: 0, callback_query: fakeCallbackQuery };
                    await (await import('./goals')).startManageGoals(fakeUpdate, newState, env);
                    return;
                }
                return;
        }
    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}`, env);
    }
    
    switch(dialog.step) {
        case STEPS.GOAL_METRIC:
            keyboard = makeKeyboard([
                [{ text: 'Прибыль (₽)', callback_data: 'goal_metric_profit' }, { text: 'ROI (%)', callback_data: 'goal_metric_roi'}],
                [{ text: 'Процент побед (%)', callback_data: 'goal_metric_win_rate' }, { text: 'Кол-во ставок', callback_data: 'goal_metric_bet_count'}]
            ]);
            break;
        case STEPS.GOAL_CONFIRM:
            keyboard = makeKeyboard([
                [{ text: '✅ Создать', callback_data: 'goal_confirm'}, { text: '❌ Отмена', callback_data: 'cancel_dialog'}]
            ]);
            break;
    }

    if (dialog.messageId) {
        await editMessageText(chatId, dialog.messageId, getAddGoalDialogText(dialog.data), env, keyboard);
    }
    
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}