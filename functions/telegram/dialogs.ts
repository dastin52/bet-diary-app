// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, Dialog, GoalMetric, Goal } from './types';
import { setUserState, addGoalToState, updateAndSyncState } from './state';
import { sendMessage, editMessageText } from './telegramApi';
import { showGoalsMenu } from './goals'; // Assuming goals has its own menu display function
import { makeKeyboard } from './ui';
import { GoogleGenAI } from "@google/genai";
import { formatDetailedReportText, calculateAnalytics } from './analytics';
import { CB } from './router';

// Main dialog router
export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env): Promise<void> {
    const dialog = state.dialog;
    if (!dialog) return;

    switch (dialog.type) {
        case 'add_goal':
            await continueAddGoalDialog(update, state, env);
            break;
        case 'ai_chat':
            await continueAiChatDialog(update, state, env);
            break;
        default:
            // Fallback for unknown dialogs
            const chatId = update.message!.chat.id;
            await sendMessage(chatId, "Диалог прерван (неизвестный тип).", env);
            const newState = { ...state, dialog: null };
            await setUserState(chatId, newState, env);
            break;
    }
}

// --- AI Chat Dialog ---

export async function startAiChatDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null): Promise<void> {
    const dialog: Dialog = { type: 'ai_chat', step: 'prompt', messageId: messageIdToEdit! };
    const newState: UserState = { ...state, dialog };
    
    const text = "🤖 С чем я могу помочь? Задайте вопрос о вашей статистике, предстоящем матче или попросите совета.";
    const keyboard = makeKeyboard([[{ text: '◀️ Отмена', callback_data: CB.BACK_TO_MAIN }]]);

    let sentMessage;
    if (messageIdToEdit) {
        sentMessage = await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        sentMessage = await sendMessage(chatId, text, env, keyboard);
    }
    
    newState.dialog!.messageId = sentMessage.result.message_id;
    await setUserState(chatId, newState, env);
}

async function continueAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = update.message!.chat.id;
    const text = update.message!.text;

    if (!text) {
        await sendMessage(chatId, "Пожалуйста, отправьте текстовый вопрос.", env);
        return;
    }

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const model = ai.models['gemini-2.5-flash'];

    await sendMessage(chatId, "_🤖 Думаю..._", env);

    const analytics = calculateAnalytics(state);
    const context = formatDetailedReportText(analytics);
    
    const prompt = `Контекст моей статистики:\n${context}\n\nМой вопрос: "${text}"`;

    const result = await model.generateContent(prompt);
    const response = await result.text;
    
    await sendMessage(chatId, response, env);

    // End the dialog after one response
    const newState = { ...state, dialog: null };
    await updateAndSyncState(chatId, newState, env);
    await sendMessage(chatId, "Чем еще могу помочь? (диалог завершен)", env);
}


// --- Add Goal Dialog ---

export async function startAddGoalDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null): Promise<void> {
    const dialog: Dialog = { type: 'add_goal', step: 'title', messageId: messageIdToEdit!, data: {} };
    const newState: UserState = { ...state, dialog };
    
    const text = "🎯 *Новая цель*\n\nВведите название цели (например, 'Выйти в плюс по футболу').";
    
    let sentMessage;
    if (messageIdToEdit) {
       sentMessage = await editMessageText(chatId, messageIdToEdit, text, env);
    } else {
       sentMessage = await sendMessage(chatId, text, env);
    }
    
    newState.dialog!.messageId = sentMessage.result.message_id;
    await setUserState(chatId, newState, env);
}

async function continueAddGoalDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message!;
    const dialog = state.dialog!;
    const text = message.text;

    let nextStep = dialog.step;
    let nextData = dialog.data || {};
    let responseText = '';

    switch (dialog.step) {
        case 'title':
            nextData.title = text;
            nextStep = 'metric';
            responseText = 'Отлично! Теперь выберите метрику для отслеживания.';
            // In a real app, you'd show a keyboard here.
            break;
        // ... other steps like 'metric', 'targetValue', 'deadline' would follow
    }
    
    // For this reconstruction, we'll assume a simplified flow and end the dialog.
    const finalGoal: Omit<Goal, 'id' | 'createdAt' | 'currentValue' | 'status'> = {
        title: nextData.title || "Новая цель",
        metric: GoalMetric.Profit,
        targetValue: 1000,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        scope: { type: 'all' },
    };
    
    const finalState = addGoalToState(state, finalGoal);
    finalState.dialog = null;
    await updateAndSyncState(message.chat.id, finalState, env);

    await sendMessage(message.chat.id, `✅ Цель "${finalGoal.title}" создана (с параметрами по умолчанию).`, env);
    await showGoalsMenu(update, finalState, env, 0); // Need to implement showGoalsMenu
}

async function showGoalsMenu(update: TelegramUpdate, state: UserState, env: Env, page: number) {
    // This is a placeholder as the actual implementation is in goals.ts, creating a circular dependency
    await sendMessage(update.message!.chat.id, "Вы вернулись в меню целей.", env);
}
