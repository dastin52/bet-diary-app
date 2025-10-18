// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, DialogState, BetType, BetStatus, GoalMetric, Message, BetLeg } from './types';
import { setUserState, addBetToState, updateAndSyncState, addGoalToState } from './state';
import { sendMessage, editMessageText, deleteMessage, reportError } from './telegramApi';
import { showMainMenu, makeKeyboard } from './ui';
import { SPORTS, MARKETS_BY_SPORT, BOOKMAKERS, COMMON_ODDS } from '../constants';
import { CB } from './router';
import { GoogleGenAI } from '@google/genai';
import { calculateAnalytics } from './analytics';

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

// --- DIALOG MANAGEMENT ---

async function endDialog(chatId: number, state: UserState, env: Env, successText: string = "Действие отменено.") {
    if (state.dialog && state.dialog.messageId) {
        try {
            await deleteMessage(chatId, state.dialog.messageId, env);
        } catch (e) { console.warn(`Could not delete dialog message: ${e}`); }
    }
    const newState = { ...state, dialog: null };
    await setUserState(chatId, newState, env);
    await showMainMenu(chatId, null, env, successText);
}


// --- ADD BET DIALOG ---

export async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const dialog: DialogState = {
        type: 'add_bet',
        step: 'select_sport',
        data: { legs: [], betType: BetType.Single, status: BetStatus.Pending },
    };
    const text = "👇 Выберите вид спорта:";
    const keyboard = makeKeyboard([
        ...chunk(SPORTS.map(s => ({ text: s, callback_data: s })), 2),
        [{ text: '❌ Отмена', callback_data: 'cancel' }],
    ]);
    const sentMessage = await sendMessage(chatId, text, env, keyboard);
    const newState = { ...state, dialog: { ...dialog, messageId: sentMessage.result.message_id } };
    await setUserState(chatId, newState, env);
}

async function handleAddBetResponse(update: TelegramUpdate, state: UserState, env: Env) {
    const { dialog } = state;
    if (!dialog || !dialog.messageId) return;

    const chatId = update.callback_query?.message.chat.id || update.message!.chat.id;
    const messageId = dialog.messageId;
    const answer = update.callback_query?.data || update.message?.text || '';

    let newDialogState = { ...dialog };
    let text = '';
    let keyboard: any;

    switch (dialog.step) {
        case 'select_sport':
            newDialogState.data.sport = answer;
            newDialogState.step = 'enter_teams';
            text = `Выбрано: *${answer}*. Введите команды/участников через дефис (например, Реал Мадрид - Барселона)`;
            keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'cancel' }]]);
            break;
        
        // Other cases for adding a bet can be added here (market, stake, odds, etc.)
        // This is a simplified version for demonstration

        default:
            await endDialog(chatId, state, env, "Что-то пошло не так. Диалог отменен.");
            return;
    }
    
    await editMessageText(chatId, messageId, text, env, keyboard);
    await setUserState(chatId, { ...state, dialog: newDialogState }, env);
}


// --- AI CHAT DIALOG ---

export async function startAiChatDialog(chatId: number, state: UserState, env: Env) {
    const dialog: DialogState = {
        type: 'ai_chat',
        step: 'chatting',
        data: { history: [] },
    };
    const text = "🤖 *AI-Аналитик*\n\nЗадайте любой вопрос о вашей статистике, попросите проанализировать предстоящий матч или просто спросите совета. Чтобы закончить диалог, отправьте /stop.";
    await sendMessage(chatId, text, env); // Don't use startDialog, this is a new conversation thread
    await setUserState(chatId, { ...state, dialog }, env);
}

async function handleAiChatResponse(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message;
    if (!message?.text || !state.dialog) return;

    const chatId = message.chat.id;
    const userMessage: Message = { role: 'user', text: message.text };
    const history = [...(state.dialog.data.history || []), userMessage];

    await sendMessage(chatId, "⏳ Думаю...", env);

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const analytics = calculateAnalytics(state);
    
    // Simplified context for now
    const prompt = `User analytics summary: ROI is ${analytics.roi.toFixed(2)}%, Win rate is ${analytics.winRate.toFixed(2)}%. User question: ${message.text}`;
    
    const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{text: prompt}]}],
        config: {
            systemInstruction: "You are a helpful betting analyst assistant for a Telegram bot. Keep answers concise and helpful. Answer in Russian.",
        }
    });

    const modelResponse = result.text;
    const modelMessage: Message = { role: 'model', text: modelResponse };
    
    await sendMessage(chatId, modelResponse, env);

    const newDialog = { ...state.dialog, data: { history: [...history, modelMessage] } };
    await setUserState(chatId, { ...state, dialog: newDialog }, env);
}


// --- ADD GOAL DIALOG ---

export async function startAddGoalDialog(chatId: number, state: UserState, env: Env, messageId: number) {
     const dialog: DialogState = {
        type: 'add_goal',
        step: 'enter_title',
        data: {},
        messageId: messageId,
    };
    const text = "Введите название для вашей цели (например, 'Выйти в плюс по футболу').";
    await editMessageText(chatId, messageId, text, env);
    await setUserState(chatId, { ...state, dialog }, env);
}

async function handleAddGoalResponse(update: TelegramUpdate, state: UserState, env: Env) { /* ... implementation ... */ }


// --- MAIN DIALOG ROUTER ---

export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message;
    const callbackQuery = update.callback_query;
    const chatId = message?.chat.id || callbackQuery?.message.chat.id;

    if (!chatId || !state.dialog) return;

    if ((message?.text && message.text === '/stop') || (callbackQuery?.data === 'cancel')) {
        await endDialog(chatId, state, env);
        return;
    }

    try {
        switch (state.dialog.type) {
            case 'add_bet':
                await handleAddBetResponse(update, state, env);
                break;
            case 'ai_chat':
                await handleAiChatResponse(update, state, env);
                break;
            case 'add_goal':
                // For simplicity, we'll assume the goal dialog is not fully implemented yet
                await sendMessage(chatId, "Добавление целей через бота в разработке.", env);
                await endDialog(chatId, state, env);
                break;
        }
    } catch(error) {
        await reportError(chatId, env, `Dialog (${state.dialog.type})`, error);
        await setUserState(chatId, {...state, dialog: null }, env); // Abort dialog on error
    }
}