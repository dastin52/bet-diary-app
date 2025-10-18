// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, Dialog, Bet, BetType, BetStatus, Goal, GoalMetric } from './types';
import { editMessageText, sendMessage, deleteMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { addBetToState, addGoalToState, updateAndSyncState } from './state';
import { showMainMenu } from './ui';
import { SPORTS } from '../constants';
import { GoogleGenAI } from "@google/genai";
import { analyticsToText, calculateAnalytics } from './analytics';

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
    // Implementation for starting the add goal dialog
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

    const text = "🤖 Спросите AI-аналитика что-нибудь о вашей статистике или предстоящем матче. \n\n_Чтобы выйти из чата, отправьте /exit._";
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


// --- DIALOG HANDLER ---

export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.dialog) return;
    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id!;

    // A simple cancel mechanism
    if ((update.message?.text === '/exit') || (update.callback_query?.data === 'dialog|cancel')) {
        await endDialog(state.dialog.messageId, chatId, env, state, "Действие отменено.");
        return;
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
            // Should not happen
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
    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id!;
    const messageId = state.dialog!.messageId;
    let text = update.message?.text || update.callback_query?.data?.replace('dialog|', '');
    if (!text) return;

    const dialogData = state.dialog!.data;
    let nextStep = state.dialog!.step;

    switch (state.dialog!.step) {
        case 'sport':
            dialogData.sport = text;
            nextStep = 'teams';
            await editMessageText(chatId, messageId, `🏈 Введите команды/участников (например, 'Команда 1 - Команда 2'):`, env);
            break;

        case 'teams':
            const teams = text.split(/[-–—vsvs\.]/);
            if (teams.length < 2) {
                await sendMessage(chatId, "Неверный формат. Попробуйте 'Команда 1 - Команда 2'.", env);
                return;
            }
            dialogData.homeTeam = teams[0].trim();
            dialogData.awayTeam = teams[1].trim();
            nextStep = 'market';
            await editMessageText(chatId, messageId, `📈 Введите исход (например, 'П1', 'Тотал > 2.5'):`, env);
            break;

        case 'market':
            dialogData.market = text;
            nextStep = 'stake';
            await editMessageText(chatId, messageId, `💰 Введите сумму ставки:`, env);
            break;

        case 'stake':
            const stake = parseFloat(text);
            if (isNaN(stake) || stake <= 0) {
                await sendMessage(chatId, "Неверная сумма. Введите положительное число.", env);
                return;
            }
            dialogData.stake = stake;
            nextStep = 'odds';
            await editMessageText(chatId, messageId, `🎲 Введите коэффициент:`, env);
            break;

        case 'odds':
            const odds = parseFloat(text);
            if (isNaN(odds) || odds <= 1) {
                await sendMessage(chatId, "Неверный коэффициент. Введите число больше 1.", env);
                return;
            }
            dialogData.odds = odds;
            
            const newBet: Omit<Bet, 'id' | 'createdAt' | 'event'> = {
                sport: dialogData.sport,
                legs: [{ homeTeam: dialogData.homeTeam, awayTeam: dialogData.awayTeam, market: dialogData.market }],
                bookmaker: 'Telegram',
                betType: BetType.Single,
                stake: dialogData.stake,
                odds: dialogData.odds,
                status: BetStatus.Pending,
                tags: ['telegram_bot']
            };
            
            const newState = addBetToState(state, newBet);
            await endDialog(messageId, chatId, env, newState, "✅ Ставка успешно добавлена!");
            return;
    }

    // Update state with new step
    const newState = { ...state, dialog: { ...state.dialog!, step: nextStep, data: dialogData } };
    await updateAndSyncState(chatId, newState, env);
}

async function handleAddGoalDialog(update: TelegramUpdate, state: UserState, env: Env) {
    // Simplified version for brevity
    const chatId = update.message!.chat.id;
    const text = update.message!.text;
    if (!text) return;

    if (state.dialog!.step === 'title') {
        const newGoal: Omit<Goal, 'id' | 'createdAt' | 'currentValue' | 'status'> = {
            title: text,
            metric: GoalMetric.Profit, // Default
            targetValue: 1000, // Default
            deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            scope: { type: 'all' }
        };
        const newState = addGoalToState(state, newGoal);
        await endDialog(state.dialog!.messageId, chatId, env, newState, "🎯 Цель успешно добавлена!");
    }
}

async function handleAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = update.message!.chat.id;
    const text = update.message!.text;
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
        
        let systemInstruction = "Вы — эксперт-аналитик по спортивным ставкам. Отвечайте на русском языке.";
        if (history.length === 0) {
            contents[0].parts[0].text += `\n\nВот моя текущая статистика: ${analyticsToText(calculateAnalytics(state))}`;
        }
        
        const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            config: { systemInstruction },
        });

        await sendMessage(chatId, result.text, env);

        // Update history in dialog state
        history.push({ role: 'user', text: text });
        history.push({ role: 'model', text: result.text });
        const newState = { ...state, dialog: { ...state.dialog!, data: { history } } };
        await updateAndSyncState(chatId, newState, env);

    } catch (e) {
        console.error("AI Chat Dialog Error:", e);
        await sendMessage(chatId, "Произошла ошибка при общении с AI. Попробуйте снова.", env);
    }
}
