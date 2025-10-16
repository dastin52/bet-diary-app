// functions/telegram/dialogs.ts
import { Bet, BetStatus, BetType, Dialog, Env, TelegramMessage, UserState, TelegramCallbackQuery, BankTransactionType } from './types';
import { setUserState } from './state';
// FIX: Import 'reportError' to make it available in catch blocks.
import { editMessageText, sendMessage, reportError } from './telegramApi';
import { BOOKMAKERS, SPORTS, BET_TYPE_OPTIONS } from '../constants';
import { calculateProfit, generateEventString } from '../utils/betUtils';
import { makeKeyboard } from './ui';
import { showMainMenu } from './ui';
import { GoogleGenAI } from '@google/genai';

// --- DIALOG ROUTER ---

export async function continueDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    if (!state.dialog) return;
    // FIX: Get chatId here to use in the default case.
    const chatId = 'message' in update ? update.message.chat.id : update.chat.id;
    switch (state.dialog.type) {
        case 'add_bet':
            await continueAddBetDialog(update, state, env);
            break;
        case 'ai_chat':
            await continueAiChatDialog(update, state, env);
            break;
        // Другие типы диалогов (login, register) можно добавить сюда
        default:
            console.error(`Unknown dialog type: ${state.dialog.type}`);
            state.dialog = null;
            // FIX: Use the numeric 'chatId' instead of the string 'state.user.email'.
            await setUserState(chatId, state, env);
    }
}

// --- ADD BET DIALOG ---

const STEPS = {
    EVENT: 'EVENT', STAKE: 'STAKE', ODDS: 'ODDS', CONFIRM: 'CONFIRM'
};

function addBetToState(state: UserState, betData: Omit<Bet, 'id' | 'createdAt' | 'event'>): UserState {
    const newBet: Bet = { ...betData, id: `tg-${Date.now()}`, createdAt: new Date().toISOString(), event: generateEventString(betData.legs, betData.betType, betData.sport) };
    if (newBet.status !== BetStatus.Pending) newBet.profit = calculateProfit(newBet);
    
    const newState = { ...state, bets: [newBet, ...state.bets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())};

    if (newBet.profit && newBet.profit !== 0) {
        const type = newBet.profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
        const newBalance = newState.bankroll + newBet.profit;
        const newTransaction = { id: `tx-tg-${Date.now()}`, timestamp: new Date().toISOString(), type, amount: newBet.profit, previousBalance: newState.bankroll, newBalance, description: `Ставка: ${newBet.event}`, betId: newBet.id };
        newState.bankroll = newBalance;
        newState.bankHistory = [newTransaction, ...newState.bankHistory];
    }
    return newState;
}

const getAddBetDialogText = (data: Dialog['data']): string => `*📝 Новая ставка*\n\n- *Событие:* ${data.event || '_не указано_'}\n- *Сумма:* ${data.stake ? `${data.stake} ₽` : '_не указана_'}\n- *Коэф.:* ${data.odds || '_не указан_'}\n\n${getStepPrompt(data.step)}`;
const getStepPrompt = (step: string): string => {
    switch (step) {
        case STEPS.EVENT: return 'Введите событие в формате: *Команда 1 - Команда 2, Исход* (например: `Реал Мадрид - Барселона, П1`)';
        case STEPS.STAKE: return 'Введите сумму ставки (например: `100`)';
        case STEPS.ODDS: return 'Введите коэффициент (например: `1.85`)';
        case STEPS.CONFIRM: return 'Всё верно?';
        default: return '';
    }
};

export async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'add_bet', step: STEPS.EVENT, data: {} };
    const sentMessage = await sendMessage(chatId, getAddBetDialogText(dialog), env);
    dialog.messageId = sentMessage.result.message_id;
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

async function continueAddBetDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    // FIX: Use a robust type guard to get chatId and prevent 'never' type errors.
    const chatId = 'message' in update ? update.message.chat.id : update.chat.id;
    const dialog = state.dialog!;
    const userInput = 'data' in update ? update.data : 'text' in update ? update.text : '';

    try {
        switch (dialog.step) {
            case STEPS.EVENT:
                const match = userInput.match(/(.+)\s*-\s*(.+),\s*(.+)/);
                if (!match) throw new Error("Неверный формат. Используйте: `Команда 1 - Команда 2, Исход`");
                const [, homeTeam, awayTeam, market] = match.map(s => s.trim());
                dialog.data = { event: userInput, sport: 'Футбол', betType: 'single', legs: [{ homeTeam, awayTeam, market }], bookmaker: 'Telegram' };
                dialog.step = STEPS.STAKE;
                break;
            case STEPS.STAKE:
                const stake = parseFloat(userInput);
                if (isNaN(stake) || stake <= 0) throw new Error("Сумма должна быть числом больше 0.");
                dialog.data.stake = stake;
                dialog.step = STEPS.ODDS;
                break;
            case STEPS.ODDS:
                const odds = parseFloat(userInput);
                if (isNaN(odds) || odds <= 1) throw new Error("Коэф. должен быть числом больше 1.");
                dialog.data.odds = odds;
                dialog.step = STEPS.CONFIRM;
                break;
            case STEPS.CONFIRM:
                if (userInput === 'dialog_confirm') {
                    const finalBetData = { ...dialog.data, status: BetStatus.Pending };
                    const newState = addBetToState(state, finalBetData as any);
                    await editMessageText(chatId, dialog.messageId!, `✅ Ставка "${dialog.data.event}" успешно добавлена!`, env);
                    newState.dialog = null;
                    await setUserState(chatId, newState, env);
                    await showMainMenu(update, env);
                    return;
                } else if (userInput === 'dialog_cancel') {
                    await editMessageText(chatId, dialog.messageId!, "❌ Добавление отменено.", env);
                    state.dialog = null;
                    await setUserState(chatId, state, env);
                    await showMainMenu(update, env);
                    return;
                }
                return;
        }
    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Ошибка'}. Попробуйте еще раз.`, env);
    }

    const keyboard = dialog.step === STEPS.CONFIRM ? makeKeyboard([[{ text: '✅ Сохранить', callback_data: 'dialog_confirm' }, { text: '❌ Отмена', callback_data: 'dialog_cancel' }]]) : undefined;
    await editMessageText(chatId, dialog.messageId!, getAddBetDialogText(dialog), env, keyboard);
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

// --- AI CHAT DIALOG ---

export async function startAiChatDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'ai_chat', step: 'active', data: { history: [] } };
    const text = '🤖 AI-Аналитик слушает. О чем поговорим? Чтобы выйти, напишите /menu.';
    const sentMessage = await sendMessage(chatId, text, env);
    dialog.messageId = sentMessage.result.message_id;
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

async function continueAiChatDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    // FIX: Use a robust type guard to get chatId and prevent 'never' type errors.
    const chatId = 'message' in update ? update.message.chat.id : update.chat.id;
    const dialog = state.dialog!;
    const userInput = 'text' in update ? update.text : '';

    if (!userInput || userInput.toLowerCase() === '/menu') {
        await sendMessage(chatId, "Возвращаю в главное меню.", env);
        state.dialog = null;
        await setUserState(chatId, state, env);
        await showMainMenu(update, env);
        return;
    }

    dialog.data.history.push({ role: 'user', text: userInput });

    await sendMessage(chatId, "⏳ AI-Аналитик думает...", env);

    try {
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: dialog.data.history,
          config: { systemInstruction: "You are a helpful sports betting analyst. Keep your answers concise and helpful. Respond in Russian."}
        });

        const aiResponse = response.text;
        dialog.data.history.push({ role: 'model', text: aiResponse });

        await sendMessage(chatId, aiResponse, env);

        state.dialog = dialog;
        await setUserState(chatId, state, env);
    } catch (error) {
        await reportError(chatId, env, 'AI Chat Dialog', error);
        await sendMessage(chatId, "Произошла ошибка при обращении к AI. Попробуйте еще раз.", env);
    }
}