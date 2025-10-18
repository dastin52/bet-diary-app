// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, BetLeg, BetType, BetStatus, BankTransactionType } from './types';
import { sendMessage, editMessageText, deleteMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { updateAndSyncState, setUserState } from './state';
import { SPORTS, MARKETS_BY_SPORT, COMMON_ODDS, BOOKMAKERS } from '../constants';
import { generateEventString, calculateProfit } from '../utils/betUtils';
import { showMainMenu } from './ui';
import { GoogleGenAI } from "@google/genai";
import { calculateAnalytics, analyticsToText } from './analytics';

// --- DIALOG NAMES ---
const ADD_BET_DIALOG = 'add_bet';
const ADD_GOAL_DIALOG = 'add_goal';
const AI_CHAT_DIALOG = 'ai_chat';

// A helper to cancel any ongoing dialog
async function cancelDialog(chatId: number, state: UserState, env: Env) {
    if (state.dialog && state.dialog.messageId) {
        try {
            await deleteMessage(chatId, state.dialog.messageId, env);
        } catch(e) { console.warn(`Could not delete dialog message on cancel: ${e}`); }
    }
    const newState = { ...state, dialog: null };
    await setUserState(chatId, newState, env);
    await showMainMenu(chatId, null, env, "Действие отменено.");
}

// --- MAIN DIALOG ROUTER ---
export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.dialog) return;

    // Handle button presses to cancel
    if (update.callback_query?.data === 'dialog_cancel') {
        await cancelDialog(update.callback_query.message.chat.id, state, env);
        return;
    }
    
    switch (state.dialog.name) {
        case ADD_BET_DIALOG:
            await handleAddBetDialog(update, state, env);
            break;
        case AI_CHAT_DIALOG:
            await handleAiChatDialog(update, state, env);
            break;
        // Other dialog handlers would go here
        default:
            // Should not happen, but good to have a fallback
            if (update.message) {
                await cancelDialog(update.message.chat.id, state, env);
            }
            break;
    }
}


// =======================================================================
//  AI CHAT DIALOG
// =======================================================================
export async function startAiChatDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null) {
    const dialogState = {
        name: AI_CHAT_DIALOG,
        step: 'chatting',
        data: { history: [] }, // history of { role, parts }
        messageId: messageIdToEdit || undefined,
    };
    const newState = { ...state, dialog: dialogState };
    await setUserState(chatId, newState, env);

    const text = "🤖 *AI-Аналитик*\n\nЗадайте свой вопрос. Например: 'проанализируй мою эффективность' или 'проанализируй матч реал - барселона'.\n\n_Чтобы выйти, отправьте /start._";
    
    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env);
    } else {
        const sentMessage = await sendMessage(chatId, text, env);
        newState.dialog.messageId = sentMessage.result.message_id;
        await setUserState(chatId, newState, env);
    }
}

async function handleAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    if (!update.message || !update.message.text) return;
    const chatId = update.message.chat.id;
    const userInput = update.message.text;

    await sendMessage(chatId, "⏳ AI думает...", env);
    
    try {
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const history = state.dialog?.data.history || [];

        const contents = [
            ...history,
            { role: 'user', parts: [{ text: userInput }] }
        ];

        // Inject analytics context if it's the first user message and relevant
        if (history.length === 0 && (userInput.toLowerCase().includes('эффективность') || userInput.toLowerCase().includes('статистику'))) {
            const analytics = analyticsToText(calculateAnalytics(state));
            contents[0].parts[0].text = `${analytics}\n\n${userInput}`;
        }
        
        const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            tools: [{googleSearch: {}}],
        });
        
        const aiResponse = result.text;
        
        // Update dialog history
        const newHistory = [...history, { role: 'user', parts: [{text: userInput}]}, { role: 'model', parts: [{text: aiResponse}]}];
        const newState = { ...state, dialog: { ...state.dialog!, data: { history: newHistory } } };
        await setUserState(chatId, newState, env);

        await sendMessage(chatId, aiResponse, env);

    } catch (error) {
        console.error("AI Chat dialog error:", error);
        await sendMessage(chatId, "Произошла ошибка при общении с AI. Попробуйте еще раз.", env);
    }
}


// =======================================================================
//  ADD BET DIALOG
// =======================================================================

// This is just a stub for now as it's very complex.
export async function startAddBetDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null) {
     const text = "Добавление ставок через бота находится в разработке. Пожалуйста, используйте веб-интерфейс.";
     const keyboard = makeKeyboard([[{ text: '◀️ В меню', callback_data: 'back_to_main' }]]);
     if (messageIdToEdit) {
         await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
     } else {
         await sendMessage(chatId, text, env, keyboard);
     }
}

async function handleAddBetDialog(update: TelegramUpdate, state: UserState, env: Env) {
    if(!update.message) return;
    // Placeholder for the complex dialog logic
    await sendMessage(update.message.chat.id, "This feature is under construction.", env);
    await cancelDialog(update.message.chat.id, state, env);
}

// Stubs for other dialogs
export async function startAddGoalDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null) {
    const text = "Добавление целей через бота находится в разработке.";
    const keyboard = makeKeyboard([[{ text: '◀️ В меню', callback_data: 'back_to_main' }]]);
    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}