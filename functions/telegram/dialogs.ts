// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, DialogState, BetType, BetStatus, GoalMetric, Message, BetLeg, GoalStatus, Goal } from './types';
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
            // Edit the message to show the final status, then show the main menu in a new message
            await editMessageText(chatId, state.dialog.messageId, `🏁 ${successText}`, env);
        } catch (e) { 
            console.warn(`Could not edit final dialog message: ${e}`);
            await sendMessage(chatId, `🏁 ${successText}`, env);
        }
    }
    const newState = { ...state, dialog: null };
    await setUserState(chatId, newState, env);
    await showMainMenu(chatId, null, env);
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
    // This function is still a placeholder as the main reported issues are goals and competitions.
    // A full implementation would be similar to handleAddGoalResponse.
    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
    if (!chatId) return;
    await sendMessage(chatId, "Добавление ставок через бота находится в разработке.", env);
    await endDialog(chatId, state, env, "Функция в разработке.");
}


// --- AI CHAT DIALOG ---

export async function startAiChatDialog(chatId: number, state: UserState, env: Env) {
    const dialog: DialogState = {
        type: 'ai_chat',
        step: 'chatting',
        data: { history: [] },
    };
    const text = "🤖 *AI-Аналитик*\n\nЗадайте любой вопрос о вашей статистике, попросите проанализировать предстоящий матч или просто спросите совета. Чтобы закончить диалог, отправьте /stop.";
    await sendMessage(chatId, text, env);
    await setUserState(chatId, { ...state, dialog }, env);
}

async function handleAiChatResponse(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message;
    if (!message?.text || !state.dialog) return;

    const chatId = message.chat.id;
    const userMessage: Message = { role: 'user', text: message.text };
    const history = [...(state.dialog.data.history || []), userMessage];

    const thinkingMsg = await sendMessage(chatId, "⏳ Думаю...", env);

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const analytics = calculateAnalytics(state);
    
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
    
    await deleteMessage(chatId, thinkingMsg.result.message_id, env);
    await sendMessage(chatId, modelResponse, env);

    const newDialog = { ...state.dialog, data: { history: [...history, modelMessage] } };
    await setUserState(chatId, { ...state, dialog: newDialog }, env);
}


// --- ADD GOAL DIALOG ---

export async function startAddGoalDialog(chatId: number, state: UserState, env: Env, messageId: number) {
     const dialog: DialogState = {
        type: 'add_goal',
        step: 'explanation',
        data: {},
        messageId: messageId,
    };
    const text = `🎯 *Давайте поставим цель!*

Хорошая цель помогает сфокусироваться и улучшить стратегию. Попробуем поставить SMART-цель: конкретную, измеримую, достижимую, релевантную и ограниченную по времени.

*Примеры:*
- *Прибыль:* Достичь +5000 ₽ прибыли на футболе за месяц.
- *ROI:* Добиться ROI 10% на ставках с коэф. > 2.0 за 3 месяца.

Нажмите "Начать", чтобы продолжить.`;
    const keyboard = makeKeyboard([
        [{ text: "▶️ Начать", callback_data: 'start_goal_dialog' }],
        [{ text: "❌ Отмена", callback_data: 'cancel' }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
    await setUserState(chatId, { ...state, dialog }, env);
}

async function handleAddGoalResponse(update: TelegramUpdate, state: UserState, env: Env) {
    const { dialog } = state;
    if (!dialog || !dialog.messageId) return;

    const chatId = update.callback_query?.message.chat.id || update.message!.chat.id;
    const messageId = dialog.messageId;
    const answer = update.callback_query?.data || update.message?.text || '';

    let newDialogState = { ...dialog };
    let text = '';
    let keyboard: any;

    switch (dialog.step) {
        case 'explanation':
            newDialogState.step = 'enter_title';
            text = "📝 *Шаг 1/5:* Введите название для вашей цели (например, 'Выйти в плюс по футболу').";
            keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'cancel' }]]);
            break;
        
        case 'enter_title':
            newDialogState.data.title = answer;
            newDialogState.step = 'select_metric';
            text = `✅ Название: *${answer}*\n\n*Шаг 2/5:* Выберите главную метрику для отслеживания.`;
            keyboard = makeKeyboard([
                [{ text: 'Прибыль (₽)', callback_data: GoalMetric.Profit }, { text: 'ROI (%)', callback_data: GoalMetric.ROI }],
                [{ text: 'Процент побед (%)', callback_data: GoalMetric.WinRate }, { text: 'Кол-во ставок', callback_data: GoalMetric.BetCount }],
                [{ text: '❌ Отмена', callback_data: 'cancel' }]
            ]);
            break;

        case 'select_metric':
            newDialogState.data.metric = answer;
            newDialogState.step = 'enter_target';
            text = `✅ Метрика: *${answer}*\n\n*Шаг 3/5:* Введите целевое значение. Например, '5000' для прибыли или '10' для ROI.`;
            keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'cancel' }]]);
            break;

        case 'enter_target':
            const target = parseFloat(answer);
            if (isNaN(target)) {
                text = "⚠️ Неверное значение. Пожалуйста, введите число (например, 5000 или -200).";
                // Don't change step, wait for correct input
                keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'cancel' }]]);
            } else {
                newDialogState.data.targetValue = target;
                newDialogState.step = 'select_deadline';
                text = `✅ Цель: *${answer}*\n\n*Шаг 4/5:* Выберите срок выполнения цели.`;
                keyboard = makeKeyboard([
                    [{ text: 'Неделя', callback_data: 'week' }, { text: 'Месяц', callback_data: 'month' }, { text: 'Квартал', callback_data: 'quarter' }],
                    [{ text: '❌ Отмена', callback_data: 'cancel' }]
                ]);
            }
            break;
            
        case 'select_deadline':
            const deadline = new Date();
            if (answer === 'week') deadline.setDate(deadline.getDate() + 7);
            else if (answer === 'month') deadline.setMonth(deadline.getMonth() + 1);
            else if (answer === 'quarter') deadline.setMonth(deadline.getMonth() + 3);
            
            newDialogState.data.deadline = deadline.toISOString();
            newDialogState.step = 'confirm';
            
            // For simplicity, we skip scope selection in this version
            newDialogState.data.scope = { type: 'all' };

            text = `*✨ Почти готово! Проверьте вашу цель:*
            
- *Название:* ${newDialogState.data.title}
- *Метрика:* ${newDialogState.data.metric}
- *Цель:* ${newDialogState.data.targetValue}
- *Дедлайн:* ${deadline.toLocaleDateString('ru-RU')}

Всё верно?`;
            keyboard = makeKeyboard([
                [{ text: '✅ Создать цель', callback_data: 'confirm' }],
                [{ text: '❌ Отмена', callback_data: 'cancel' }]
            ]);
            break;
            
        case 'confirm':
            if (answer === 'confirm') {
                const goalData: Omit<Goal, 'id' | 'createdAt' | 'currentValue' | 'status'> = {
                    title: newDialogState.data.title,
                    metric: newDialogState.data.metric,
                    targetValue: newDialogState.data.targetValue,
                    deadline: newDialogState.data.deadline,
                    scope: newDialogState.data.scope,
                };
                const newState = addGoalToState(state, goalData);
                await updateAndSyncState(chatId, newState, env);
                // FIX: Pass the updated newState to endDialog to prevent state rollback.
                await endDialog(chatId, newState, env, "Новая цель успешно создана!");
                return; 
            } else {
                await endDialog(chatId, state, env);
                return;
            }

        default:
            await endDialog(chatId, state, env, "Что-то пошло не так. Диалог отменен.");
            return;
    }
    
    await editMessageText(chatId, messageId, text, env, keyboard);
    await setUserState(chatId, { ...state, dialog: newDialogState }, env);
}


// --- MAIN DIALOG ROUTER ---

export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message;
    const callbackQuery = update.callback_query;
    const chatId = message?.chat.id || callbackQuery?.message.chat.id;

    if (!chatId || !state.dialog) return;

    if ((message?.text && (message.text === '/stop' || message.text === '/cancel')) || (callbackQuery?.data === 'cancel')) {
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
                await handleAddGoalResponse(update, state, env);
                break;
        }
    } catch(error) {
        await reportError(chatId, env, `Dialog (${state.dialog.type})`, error);
        await setUserState(chatId, {...state, dialog: null }, env); // Abort dialog on error
    }
}