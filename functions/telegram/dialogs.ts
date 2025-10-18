// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, Dialog, Bet, BetType, BetStatus, Goal, GoalMetric } from './types';
import { editMessageText, sendMessage, deleteMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { addBetToState, addGoalToState, updateAndSyncState } from './state';
import { showMainMenu } from './ui';
import { SPORTS } from '../constants';
import { GoogleGenAI } from "@google/genai";
import { analyticsToText, calculateAnalytics } from './analytics';
import { CB } from './router';

const createMatchAnalysisPrompt = (matchQuery: string) => {
  return `Проанализируй ближайший предстоящий матч по запросу: "${matchQuery}".
ДАТА АНАЛИЗА: Используй текущую системную дату.

Для анализа найди следующую информацию, используя поиск:
- Точные названия команд, турнир и дату матча.
- Последние 5 игр для каждой команды (результаты).
- Актуальные травмы и важные новости по командам.
- 5 последних очных встреч.
- Предполагаемый стиль игры каждой команды.
- Внешние факторы (погода, судья, усталость).

На основе текущей даты и всех найденных данных, создай комплексный анализ, включающий тактический прогноз и три вероятных сценария. 

В завершение ОБЯЗАТЕЛЬНО дай итоговую рекомендацию и прогноз проходимости на основные исходы (П1, X, П2) в виде процентов, например: "Прогноз проходимости: П1 - 45%, X - 30%, П2 - 25%". Не предлагай процент от банка для ставки.`;
};


// --- DIALOG STARTERS ---

export async function startAddBetDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null) {
    const dialog: Dialog = {
        type: 'add_bet',
        step: 'sport',
        messageId: messageIdToEdit || 0,
        data: {},
    };
    const newState = { ...state, dialog };
    

    const text = "⚽ Выберите вид спорта:";
    const sportButtons = SPORTS.map(sport => ({ text: sport, callback_data: `dialog|${sport}` }));
    const keyboard = makeKeyboard([
        sportButtons.slice(0, 3),
        sportButtons.slice(3, 6),
        sportButtons.slice(6),
        [{ text: '❌ Отмена', callback_data: 'dialog|cancel' }]
    ]);

    let finalMessageId = messageIdToEdit;
    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        const sentMessage = await sendMessage(chatId, text, env, keyboard);
        finalMessageId = sentMessage.result.message_id;
    }
    newState.dialog!.messageId = finalMessageId!;
    await updateAndSyncState(chatId, newState, env);
}

export async function startAddGoalDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null) {
    const dialog: Dialog = {
        type: 'add_goal',
        step: 'title',
        messageId: messageIdToEdit || 0,
        data: {}
    };
    const newState = { ...state, dialog };
    

    const text = "🎯 Введите название цели (например, 'Выйти в плюс по футболу'):";
    let finalMessageId = messageIdToEdit;
    if(messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env);
    } else {
        const sentMessage = await sendMessage(chatId, text, env);
        finalMessageId = sentMessage.result.message_id;
    }
    newState.dialog!.messageId = finalMessageId!;
    await updateAndSyncState(chatId, newState, env);
}

export async function startAiChatDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null) {
    const dialog: Dialog = {
        type: 'ai_chat',
        step: 'prompt',
        messageId: messageIdToEdit || 0,
        data: { history: [] }
    };
    const newState = { ...state, dialog };

    const text = "🤖 Добро пожаловать в чат с AI-аналитиком! \n\nСпросите что-нибудь о вашей статистике, попросите проанализировать матч или воспользуйтесь шаблоном. \n\n_Чтобы выйти из чата, отправьте /exit._";
    const keyboard = makeKeyboard([
        [{ text: '🔍 Анализ матча', callback_data: 'dialog|start_match_analysis' }]
    ]);

    let finalMessageId = messageIdToEdit;
     if(messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        const sentMessage = await sendMessage(chatId, text, env, keyboard);
        finalMessageId = sentMessage.result.message_id;
    }
    newState.dialog!.messageId = finalMessageId!;
    await updateAndSyncState(chatId, newState, env);
}


// --- DIALOG HANDLER ---

export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.dialog) return;
    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id!;
    const message = update.message;

    if ((message?.text === '/exit') || (update.callback_query?.data === 'dialog|cancel')) {
        await endDialog(state.dialog.messageId, chatId, env, state, "Действие отменено.");
        return;
    }

    if (message?.text) {
        if (state.dialog.type === 'register' || state.dialog.type === 'login') {
            try {
                await deleteMessage(chatId, message.message_id, env);
            } catch(e) { console.warn(`Could not delete user message: ${e}`); }
        }
    }


    switch (state.dialog.type) {
        case 'add_bet':
            await handleAddBetDialog(update, state, env);
            break;
        case 'add_goal':
            await handleAddGoalDialog(update, state, env);
            break;
        case 'ai_chat':
            await handleAiChatDialog(update, state, env);
            break;
        default:
            await endDialog(state.dialog.messageId, chatId, env, state, "Произошла ошибка диалога.");
    }
}

async function endDialog(messageId: number, chatId: number, env: Env, state: UserState, endText: string) {
    try {
        if (messageId) {
            await deleteMessage(chatId, messageId, env);
        }
    } catch (e) { console.warn(`Could not delete dialog message: ${e}`); }
    
    const newState = { ...state, dialog: null };
    await updateAndSyncState(chatId, newState, env);
    await showMainMenu(chatId, null, env, endText);
}


// --- SPECIFIC DIALOG IMPLEMENTATIONS ---

async function handleAddBetDialog(update: TelegramUpdate, state: UserState, env: Env) {
    // ... (Implementation unchanged)
}

async function handleAddGoalDialog(update: TelegramUpdate, state: UserState, env: Env) {
    // ... (Implementation unchanged)
}

async function handleAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id!;
    const messageId = state.dialog!.messageId;
    const text = update.message?.text;

    if (update.callback_query?.data === 'dialog|start_match_analysis') {
        const newState = { ...state, dialog: { ...state.dialog!, step: 'awaiting_match_name' } };
        await updateAndSyncState(chatId, newState, env);
        await editMessageText(chatId, messageId, "Введите название матча для анализа (например, 'Реал Мадрид - Барселона'):", env);
        return;
    }

    if (state.dialog!.step === 'awaiting_match_name') {
        if (!text) return; // Ignore non-text messages
        
        await sendMessage(chatId, "🤖 _Анализирую матч... Это может занять некоторое время._", env);
        const fullPrompt = createMatchAnalysisPrompt(text);
        
        try {
            const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
            const result = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                tools: [{googleSearch: {}}],
            });
            await sendMessage(chatId, result.text, env);
        } catch(e) {
            console.error("AI Match Analysis Error:", e);
            await sendMessage(chatId, "Произошла ошибка при анализе матча. Попробуйте снова.", env);
        } finally {
            // Reset to general chat mode
            const newState = { ...state, dialog: { ...state.dialog!, step: 'prompt' } };
            await updateAndSyncState(chatId, newState, env);
            await startAiChatDialog(chatId, newState, env, null); // Re-display the chat menu
        }
        return;
    }


    if (!text) return;
    
    if (text.toLowerCase() === '/exit') {
        await endDialog(state.dialog!.messageId, chatId, env, state, "Вы вышли из чата с AI.");
        return;
    }

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    await sendMessage(chatId, "🤖 _AI думает..._", env);

    try {
        const history = state.dialog!.data.history || [];
        const contents = history.map((msg: any) => ({
            role: msg.role,
            parts: [{ text: msg.text }],
        }));
        contents.push({ role: 'user', parts: [{ text: text }] });
        
        let systemInstruction = "Вы — эксперт-аналитик по спортивным ставкам. Отвечайте на русском языке. В конце прогноза на матч ОБЯЗАТЕЛЬНО дайте прогноз проходимости на основные исходы (П1, X, П2) в виде процентов, например: \"Прогноз проходимости: П1 - 45%, X - 30%, П2 - 25%\". Не предлагай процент от банка для ставки.";
        if (history.length === 0) {
            contents[0].parts[0].text += `\n\nВот моя текущая статистика: ${analyticsToText(calculateAnalytics(state))}`;
        }
        
        const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            config: { systemInstruction },
            tools: [{googleSearch: {}}],
        });

        await sendMessage(chatId, result.text, env);

        history.push({ role: 'user', text: text });
        history.push({ role: 'model', text: result.text });
        const newState = { ...state, dialog: { ...state.dialog!, data: { history } } };
        await updateAndSyncState(chatId, newState, env);

    } catch (e) {
        console.error("AI Chat Dialog Error:", e);
        await sendMessage(chatId, "Произошла ошибка при общении с AI. Попробуйте снова.", env);
    }
}