// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, BetLeg, BetType, BetStatus, BankTransactionType, TelegramMessage, AIParsedBetData, Bet } from './types';
import { sendMessage, editMessageText, deleteMessage, getFile, downloadFile } from './telegramApi';
import { makeKeyboard } from './ui';
import { updateAndSyncState, setUserState } from './state';
import { SPORTS, MARKETS_BY_SPORT, COMMON_ODDS, BOOKMAKERS } from '../constants';
import { generateEventString, calculateProfit } from '../utils/betUtils';
import { showMainMenu } from './ui';
import { GoogleGenAI, Type } from "@google/genai";
import { calculateAnalytics, analyticsToText } from './analytics';
import { CB } from './router';

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
//  ADD BET DIALOG (VIA SCREENSHOT)
// =======================================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export async function startAddBetDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null) {
     const text = "Как вы хотите добавить ставку?";
    const keyboard = makeKeyboard([
        [{ text: '📸 Загрузить скриншот', callback_data: CB.ADD_BET_SCREENSHOT }],
        [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function startScreenshotDialog(chatId: number, messageId: number, state: UserState, env: Env) {
    const dialogState = {
        name: ADD_BET_DIALOG,
        step: 'awaiting_screenshot',
        data: {},
        messageId: messageId,
    };
    const newState = { ...state, dialog: dialogState };
    await setUserState(chatId, newState, env);

    const text = "Пожалуйста, отправьте скриншот вашей ставки.";
    const keyboard = makeKeyboard([
        [{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function processScreenshot(message: TelegramMessage, state: UserState, env: Env) {
    const chatId = message.chat.id;
    const photo = message.photo?.[message.photo.length - 1]; // Get largest photo
    if (!photo) return;

    await editMessageText(chatId, state.dialog!.messageId!, "📸 Получил скриншот. Анализирую с помощью AI...", env);

    try {
        // 1. Download image from Telegram
        const fileInfo = await getFile(photo.file_id, env);
        const imageBuffer = await downloadFile(fileInfo.result.file_path, env);
        const imageBase64 = arrayBufferToBase64(imageBuffer);

        // 2. Call Gemini Vision API
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const schema = {
            type: Type.OBJECT,
            properties: {
                sport: { type: Type.STRING },
                homeTeam: { type: Type.STRING },
                awayTeam: { type: Type.STRING },
                market: { type: Type.STRING },
                stake: { type: Type.NUMBER },
                odds: { type: Type.NUMBER },
                bookmaker: { type: Type.STRING },
            }
        };
        const prompt = `You are an expert sports bet slip parser. Analyze the provided image of a bet slip. The user's screenshot is in Russian. Extract the following information and provide it in a structured JSON format according to the schema. Extract: the first participant/team (homeTeam), the second participant/team (awayTeam), the market description, the total odds, the stake amount, the sport, and the bookmaker name from the logo. The bookmaker might be one of: 'FONBET', 'Winline', 'BetBoom', 'Лига Ставок', 'PARI'. For team names, use initials if they are provided, like 'Фернандес Л.А.'. For the market, extract the full description, for example 'Фора: Кырстя С. (1/2 финала) 1.5'. From the image context (racket, ball), the sport appears to be 'Теннис'.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                    { text: prompt },
                ],
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });
        
        const parsedData = JSON.parse(response.text);

        const parsedBet: AIParsedBetData = {
            sport: parsedData.sport || 'Не определен',
            legs: [{ homeTeam: parsedData.homeTeam, awayTeam: parsedData.awayTeam, market: parsedData.market }],
            stake: parsedData.stake,
            odds: parsedData.odds,
            bookmaker: parsedData.bookmaker || 'Другое',
            betType: BetType.Single, // Assuming single for now
        };
        
        // 3. Show confirmation
        const confirmationText = `*🔍 Распознанные данные:*
        
*Спорт:* ${parsedBet.sport}
*Событие:* ${parsedBet.legs[0].homeTeam} - ${parsedBet.legs[0].awayTeam}
*Исход:* ${parsedBet.legs[0].market}
*Букмекер:* ${parsedBet.bookmaker}
*Ставка:* ${parsedBet.stake} ₽
*Коэф.:* ${parsedBet.odds}

Все верно?`;

        const keyboard = makeKeyboard([
            [{ text: '✅ Да, сохранить', callback_data: CB.CONFIRM_PARSED_BET }],
            [{ text: '🔄 Попробовать другой скриншот', callback_data: CB.RETRY_PARSE_BET }],
            [{ text: '❌ Отмена', callback_data: 'dialog_cancel' }],
        ]);
        
        const newState = { ...state, dialog: { ...state.dialog!, step: 'confirming_data', data: { parsedBet } } };
        await setUserState(chatId, newState, env);
        await editMessageText(chatId, state.dialog!.messageId!, confirmationText, env, keyboard);

    } catch (error) {
        console.error("Error processing screenshot:", error);
        await editMessageText(chatId, state.dialog!.messageId!, "❌ Не удалось распознать данные. Попробуйте другой, более четкий скриншот.", env, makeKeyboard([[{ text: '🔄 Попробовать снова', callback_data: CB.RETRY_PARSE_BET }],[{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]));
    }
}

async function saveParsedBet(chatId: number, state: UserState, env: Env) {
    const parsedBetData = state.dialog?.data.parsedBet;
    if (!parsedBetData) return;

    const newBet: Omit<Bet, 'id' | 'createdAt' | 'event'> = {
        ...parsedBetData,
        status: BetStatus.Pending, // Default to pending
    };

    const betWithDetails: Bet = {
        ...newBet,
        id: new Date().toISOString() + Math.random(),
        createdAt: new Date().toISOString(),
        event: generateEventString(newBet.legs, newBet.betType, newBet.sport),
    };

    const newState = {
        ...state,
        bets: [betWithDetails, ...state.bets],
        dialog: null,
    };
    
    await updateAndSyncState(chatId, newState, env);
    await deleteMessage(chatId, state.dialog!.messageId!, env);
    await showMainMenu(chatId, null, env, `✅ Ставка "${betWithDetails.event}" успешно сохранена!`);
}

async function handleAddBetDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const step = state.dialog?.step;

    if (step === 'awaiting_screenshot' && update.message?.photo) {
        await processScreenshot(update.message, state, env);
    } else if (step === 'confirming_data' && update.callback_query) {
        const cb_data = update.callback_query.data;
        if (cb_data === CB.CONFIRM_PARSED_BET) {
            await saveParsedBet(update.callback_query.message.chat.id, state, env);
        } else if (cb_data === CB.RETRY_PARSE_BET) {
            await startScreenshotDialog(update.callback_query.message.chat.id, update.callback_query.message.message_id, state, env);
        }
    }
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