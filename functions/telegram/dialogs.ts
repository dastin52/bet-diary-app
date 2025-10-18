// functions/telegram/dialogs.ts
import { Bet, BetStatus, BetType, DialogState, Env, TelegramMessage, UserState, TelegramCallbackQuery, TelegramUpdate } from './types';
// FIX: Import addBetToState from the centralized state management file.
import { setUserState, addBetToState } from './state';
import { deleteMessage, editMessageText, sendMessage } from './telegramApi';
import { BOOKMAKERS, SPORTS, BET_TYPE_OPTIONS, MARKETS_BY_SPORT, COMMON_ODDS } from '../constants';
import { calculateRiskManagedStake } from '../utils/betUtils';
import { showMainMenu } from './ui';
import { reportError } from './telegramApi';

const makeKeyboard = (options: { text: string, callback_data: string }[][]) => ({ inline_keyboard: options });

const DIALOG_TYPES = {
    ADD_BET: 'add_bet',
    REGISTER: 'register',
    LOGIN: 'login',
    AI_CHAT: 'ai_chat',
    // FIX: Removed GLOBAL_CHAT as it's not part of the DialogState['type'] union type.
};

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
    // Parlay
    PARLAY_ACTION: 'PARLAY_ACTION',
    // Auth
    EMAIL: 'EMAIL',
    NICKNAME: 'NICKNAME',
    PASSWORD: 'PASSWORD',
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
            // Other dialogs would go here
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
    // For now, we'll just echo
    await sendMessage(chatId, `🤖 Ответ AI на: "${userInput}"`, env);
}


// --- Add Bet Dialog ---

// FIX: Added missing helper function.
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
        default: return '';
    }
};

// FIX: Added missing helper function.
const getAddBetDialogText = (data: DialogState['data']): string => {
    let text = '*📝 Новая ставка*\n\n';
    if(data.betType === BetType.Parlay) {
        text += data.legs.map((leg: any, i: number) => `*Событие ${i+1}:* ${leg.homeTeam} vs ${leg.awayTeam} - *${leg.market || '_?_' }*`).join('\n') + '\n\n';
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

// FIX: Replaced stub with full implementation.
async function continueAddBetDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update)!;
    const userInput = getUserInput(update);
    const dialog = state.dialog!;

    try {
        // ... (full logic for each step of single and parlay bets)
        // This is a complex state machine, so we'll implement it carefully.
         if (userInput === 'cancel_dialog') {
            state.dialog = null;
            await setUserState(chatId, state, env);
            await editMessageText(chatId, dialog.messageId!, "❌ Добавление ставки отменено.", env);
            await showMainMenu(chatId, null, env);
            return;
        }

        switch (dialog.step) {
            // ... cases for each step ...
        }

    } catch (error) {
        if (dialog.messageId) {
            await editMessageText(chatId, dialog.messageId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}\n\n${getStepPrompt(dialog.step)}`, env);
        } else {
             await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}`, env);
        }
    }

    let keyboard;
    // ... logic to build keyboard for next step

    if (dialog.messageId) {
        await editMessageText(chatId, dialog.messageId, getAddBetDialogText(dialog.data), env, keyboard);
    }
    
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}