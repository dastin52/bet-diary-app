// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, BetLeg, BetType, BetStatus, BankTransactionType, TelegramMessage, AIParsedBetData, Bet } from './types';
import { sendMessage, editMessageText, deleteMessage, getFile, downloadFile } from './telegramApi';
import { makeKeyboard } from './ui';
import { updateAndSyncState, setUserState, findUserByEmail, isNicknameTaken, createUser, mockHash } from './state';
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
const BOT_REGISTER_DIALOG = 'bot_register';
const BOT_LOGIN_DIALOG = 'bot_login';

// A helper to cancel any ongoing dialog
async function cancelDialog(chatId: number, state: UserState, env: Env) {
    if (state.dialog && state.dialog.messageId) {
        try {
            // Revert to start menu instead of deleting
            await showMainMenu(chatId, state.dialog.messageId, env, "Действие отменено.");
        } catch(e) { 
            console.warn(`Could not edit dialog message on cancel: ${e}`);
            await showMainMenu(chatId, null, env, "Действие отменено.");
        }
    }
    const newState = { ...state, dialog: null };
    await setUserState(chatId, newState, env);
}

// --- MAIN DIALOG ROUTER ---
export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.dialog) return;

    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
    if (!chatId) return;

    // Handle button presses to cancel
    if (update.callback_query?.data === 'dialog_cancel') {
        await cancelDialog(chatId, state, env);
        return;
    }
    
    switch (state.dialog.name) {
        case ADD_BET_DIALOG:
            await handleAddBetDialog(update, state, env);
            break;
        case AI_CHAT_DIALOG:
            await handleAiChatDialog(update, state, env);
            break;
        case BOT_REGISTER_DIALOG:
            await handleBotRegisterDialog(update, state, env);
            break;
        case BOT_LOGIN_DIALOG:
            await handleBotLoginDialog(update, state, env);
            break;
        default:
            await cancelDialog(chatId, state, env);
            break;
    }
}


// =======================================================================
//  BOT REGISTRATION DIALOG
// =======================================================================
export async function startBotRegisterDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null) {
    const dialogState = {
        name: BOT_REGISTER_DIALOG,
        step: 'awaiting_email',
        data: {},
        messageId: messageIdToEdit || undefined,
    };
    const newState = { ...state, dialog: dialogState };
    await setUserState(chatId, newState, env);

    const text = "📝 *Регистрация*\n\nПожалуйста, введите ваш email:";
    const keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]);

    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        const sentMessage = await sendMessage(chatId, text, env, keyboard);
        newState.dialog!.messageId = sentMessage.result.message_id;
        await setUserState(chatId, newState, env);
    }
}

async function handleBotRegisterDialog(update: TelegramUpdate, state: UserState, env: Env) {
    if (!update.message || !update.message.text) return;
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const step = state.dialog?.step;
    let newState = { ...state };

    switch (step) {
        case 'awaiting_email':
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
                await sendMessage(chatId, "❌ Неверный формат email. Попробуйте еще раз.", env);
                return;
            }
            if (await findUserByEmail(text, env)) {
                await sendMessage(chatId, "❌ Этот email уже зарегистрирован. Попробуйте войти или использовать другой email.", env);
                return;
            }
            newState.dialog!.step = 'awaiting_nickname';
            newState.dialog!.data.email = text;
            await setUserState(chatId, newState, env);
            await editMessageText(chatId, newState.dialog!.messageId!, "Придумайте себе никнейм:", env, makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]));
            break;

        case 'awaiting_nickname':
            if (text.length < 3) {
                await sendMessage(chatId, "❌ Никнейм должен быть не менее 3 символов.", env);
                return;
            }
            if (await isNicknameTaken(text, env)) {
                await sendMessage(chatId, "❌ Этот никнейм уже занят. Придумайте другой.", env);
                return;
            }
            newState.dialog!.step = 'awaiting_password';
            newState.dialog!.data.nickname = text;
            await setUserState(chatId, newState, env);
            await editMessageText(chatId, newState.dialog!.messageId!, "Придумайте пароль (минимум 6 символов):", env, makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]));
            break;

        case 'awaiting_password':
             if (text.length < 6) {
                await sendMessage(chatId, "❌ Пароль должен быть не менее 6 символов.", env);
                return;
            }
            const { email, nickname } = newState.dialog!.data;
            await createUser(chatId, update.message.from || { username: undefined }, email, nickname, text, env);
            
            await deleteMessage(chatId, newState.dialog!.messageId!, env);
            await showMainMenu(chatId, null, env, `✅ Регистрация успешна! Добро пожаловать, ${nickname}!`);
            break;
    }
}


// =======================================================================
//  BOT LOGIN DIALOG
// =======================================================================
export async function startBotLoginDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null) {
    const dialogState = {
        name: BOT_LOGIN_DIALOG,
        step: 'awaiting_email',
        data: {},
        messageId: messageIdToEdit || undefined,
    };
    const newState = { ...state, dialog: dialogState };
    await setUserState(chatId, newState, env);

    const text = "🔑 *Вход*\n\nПожалуйста, введите ваш email:";
    const keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]);

    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        const sentMessage = await sendMessage(chatId, text, env, keyboard);
        newState.dialog!.messageId = sentMessage.result.message_id;
        await setUserState(chatId, newState, env);
    }
}

async function handleBotLoginDialog(update: TelegramUpdate, state: UserState, env: Env) {
    if (!update.message || !update.message.text) return;
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const step = state.dialog?.step;
    let newState = { ...state };

    switch (step) {
        case 'awaiting_email':
            const existingUser = await findUserByEmail(text, env);
            if (!existingUser || !existingUser.user) {
                await sendMessage(chatId, "❌ Пользователь с таким email не найден. Попробуйте еще раз или зарегистрируйтесь.", env);
                return;
            }
            newState.dialog!.step = 'awaiting_password';
            newState.dialog!.data.email = text;
            await setUserState(chatId, newState, env);
            await editMessageText(chatId, newState.dialog!.messageId!, `Введите пароль для ${text}:`, env, makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]));
            break;

        case 'awaiting_password':
            const { email } = newState.dialog!.data;
            const userStateToLogin = await findUserByEmail(email, env);

            if (userStateToLogin?.user?.password_hash === mockHash(text)) {
                const finalState = { ...userStateToLogin, dialog: null };
                finalState.user!.telegramId = chatId;
                if (update.message.from && update.message.from.username) {
                    finalState.user!.telegramUsername = update.message.from.username;
                }
                
                await updateAndSyncState(chatId, finalState, env);
                await deleteMessage(chatId, newState.dialog!.messageId!, env);
                await showMainMenu(chatId, null, env, `✅ Вход выполнен! С возвращением, ${finalState.user!.nickname}!`);
            } else {
                await sendMessage(chatId, "❌ Неверный пароль. Попробуйте еще раз.", env);
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
        step: 'awaiting_choice',
        data: { history: [] },
        messageId: messageIdToEdit || undefined,
    };
    const newState = { ...state, dialog: dialogState };

    const text = "🤖 *AI-Аналитик*\n\nЧем я могу вам помочь?";
    const keyboard = makeKeyboard([
        [{ text: '📊 Проанализировать эффективность', callback_data: CB.AI_CHAT_PERFORMANCE }],
        [{ text: '⚽️ Проанализировать матч', callback_data: CB.AI_CHAT_MATCH }],
        [{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]
    ]);

    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        const sentMessage = await sendMessage(chatId, text, env, keyboard);
        newState.dialog!.messageId = sentMessage.result.message_id;
    }
    await setUserState(chatId, newState, env);
}

async function handleAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = update.message?.chat.id || update.callback_query?.message.chat.id!;
    const step = state.dialog?.step;
    let newState = { ...state };

    const callAI = async (prompt: string, history: any[]) => {
        await sendMessage(chatId, "⏳ AI думает...", env);
        try {
            const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
            const contents = [...history, { role: 'user', parts: [{ text: prompt }] }];
            const result = await ai.models.generateContent({ model: "gemini-2.5-flash", contents, tools: [{ googleSearch: {} }] });
            const aiResponse = result.text;
            
            const newHistory = [...history, { role: 'user', parts: [{ text: prompt }] }, { role: 'model', parts: [{ text: aiResponse }] }];
            newState.dialog!.data.history = newHistory;
            await setUserState(chatId, newState, env);
            await sendMessage(chatId, aiResponse, env);
        } catch (error) {
            console.error("AI Chat dialog error:", error);
            await sendMessage(chatId, "Произошла ошибка при общении с AI.", env);
        }
    };

    if (step === 'awaiting_choice') {
        if (update.callback_query) {
            const cb_data = update.callback_query.data;
            if (cb_data === CB.AI_CHAT_PERFORMANCE) {
                const analytics = analyticsToText(calculateAnalytics(state));
                const prompt = `Проанализируй мою эффективность.\n\n${analytics}`;
                newState.dialog!.step = 'chatting';
                await setUserState(chatId, newState, env);
                await editMessageText(chatId, state.dialog!.messageId!, "🤖 *AI-Аналитик*\n\nАнализирую вашу эффективность...", env);
                await callAI(prompt, []);
            } else if (cb_data === CB.AI_CHAT_MATCH) {
                newState.dialog!.step = 'awaiting_match_name';
                await setUserState(chatId, newState, env);
                await editMessageText(chatId, state.dialog!.messageId!, "Пожалуйста, введите название матча (например, 'Реал Мадрид - Барселона').", env, makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]));
            }
        } else if (update.message?.text) {
            newState.dialog!.step = 'chatting';
            await setUserState(chatId, newState, env);
            await editMessageText(chatId, state.dialog!.messageId!, "🤖 *AI-Аналитик*\n\nЗадавайте свой вопрос.", env);
            await callAI(update.message.text, state.dialog?.data.history || []);
        }
        return;
    }

    if (update.message?.text) {
        const userInput = update.message.text;
        if (step === 'awaiting_match_name') {
            const prompt = `Проанализируй матч: ${userInput}`;
            newState.dialog!.step = 'chatting';
            await setUserState(chatId, newState, env);
            await editMessageText(chatId, state.dialog!.messageId!, "🤖 *AI-Аналитик*\n\nАнализирую матч...", env);
            await callAI(prompt, state.dialog?.data.history || []);
        } else if (step === 'chatting') {
            await callAI(userInput, state.dialog?.data.history || []);
        }
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
                betType: { type: Type.STRING, description: "Type of the bet, either 'single' or 'parlay'. Parlay is 'Экспресс' in Russian." },
                status: { type: Type.STRING, description: "The outcome of the bet, if available. Can be 'won', 'lost', 'pending', 'void', or 'cashed_out'. 'Проигрыш' is 'lost'." },
                legs: {
                    type: Type.ARRAY,
                    description: "An array of all individual bets (legs) in the slip. For a single bet, this will be an array with one item.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            homeTeam: { type: Type.STRING, description: "The first participant or home team." },
                            awayTeam: { type: Type.STRING, description: "The second participant or away team." },
                            market: { type: Type.STRING, description: "The bet description or market for this leg (e.g., 'Фора 1 (0)')." },
                        }
                    }
                },
                stake: { type: Type.NUMBER, description: "The total amount of money staked." },
                odds: { type: Type.NUMBER, description: "The total combined odds for the bet." },
                bookmaker: { type: Type.STRING, description: "Name of the bookmaker, if a logo is visible." },
                sport: { type: Type.STRING, description: "The general sport for the bet slip. If multiple sports, pick the most prominent one or the first one." },
            },
            required: ["betType", "legs", "stake", "odds"]
        };
        const prompt = `You are an expert sports bet slip parser. Analyze the provided image of a bet slip from a Russian bookmaker. Your task is to extract all relevant information into a structured JSON format.

Please identify the following:
1.  **betType**: Determine if it's a single bet ('single') or a parlay ('parlay'). A parlay is usually labeled "Экспресс".
2.  **status**: If the outcome is visible (e.g., "Выигрыш", "Проигрыш", "Возврат"), map it to 'won', 'lost', or 'void'. If not visible, omit this field. "Проигрыш" means 'lost'.
3.  **legs**: Extract all individual bet legs into an array. Each leg should be an object with:
    *   \`homeTeam\`: The first team/participant.
    *   \`awayTeam\`: The second team/participant.
    *   \`market\`: The specific bet on that event (e.g., 'Фора 1 (0)', 'X2').
4.  **stake**: The total amount of money staked on the entire slip.
5.  **odds**: The total combined odds for the slip.
6.  **bookmaker**: Identify the bookmaker if possible.
7.  **sport**: Infer the sport for each leg if possible and provide a general sport for the slip. For events like "Чикаго - Ванкувер" or "Юта - Сан-Хосе", this is likely Hockey or Basketball. For "Фернандес Л - Кирстя С", this is Tennis. Use a general sport if unsure or multiple are present.

For the provided image, it might be an "Экспресс" (parlay). Extract all legs correctly.`;

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

        // Sanitize numeric inputs from Gemini that might be strings with currency symbols
        const stakeStr = String(parsedData.stake || '0');
        const oddsStr = String(parsedData.odds || '1');
        const sanitizedStake = parseFloat(stakeStr.replace(/[^0-9.,]/g, '').replace(',', '.'));
        const sanitizedOdds = parseFloat(oddsStr.replace(/[^0-9.,]/g, '').replace(',', '.'));


        const parsedBet: AIParsedBetData = {
            sport: parsedData.sport || 'Не определен',
            legs: parsedData.legs || [],
            stake: isNaN(sanitizedStake) ? 0 : sanitizedStake,
            odds: isNaN(sanitizedOdds) ? 1 : sanitizedOdds,
            bookmaker: parsedData.bookmaker || 'Другое',
            betType: parsedData.betType || BetType.Single,
            status: parsedData.status ? (parsedData.status.toLowerCase() as BetStatus) : undefined,
        };
        
        // 3. Show confirmation
        const legsText = parsedBet.legs.map((leg, index) => 
            `  ${index + 1}. ${leg.homeTeam} - ${leg.awayTeam} (${leg.market})`
        ).join('\n');

        const betTypeLabel = parsedBet.betType === 'parlay' ? 'Экспресс' : 'Одиночная';
        const statusLabel = parsedBet.status ? ` (${parsedBet.status})` : '';

        const confirmationText = `*🔍 Распознанные данные:*

*Тип ставки:* ${betTypeLabel}${statusLabel}
*События:*\n${legsText}
*Букмекер:* ${parsedBet.bookmaker}
*Спорт:* ${parsedBet.sport}
*Ставка:* ${parsedBet.stake} ₽
*Общий коэф.:* ${parsedBet.odds}

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

    let betToSave: Omit<Bet, 'id' | 'createdAt' | 'event'> = {
        ...parsedBetData,
        status: parsedBetData.status || BetStatus.Pending,
    };

    let profit = 0;
    // If the bet is settled, calculate profit and create a bank transaction
    if (betToSave.status !== BetStatus.Pending) {
        profit = calculateProfit(betToSave);
        betToSave.profit = profit;
    }

    const betWithDetails: Bet = {
        ...betToSave,
        id: new Date().toISOString() + Math.random(),
        createdAt: new Date().toISOString(),
        event: generateEventString(betToSave.legs, betToSave.betType, betToSave.sport),
    };

    const newState: UserState = {
        ...state,
        bets: [betWithDetails, ...state.bets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        dialog: null,
        bankroll: state.bankroll,
        bankHistory: [...state.bankHistory],
    };

    if (profit !== 0) {
        const type = profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
        const description = type === BankTransactionType.BetWin ? `Выигрыш: ${betWithDetails.event}` : `Проигрыш: ${betWithDetails.event}`;
        const newBalance = state.bankroll + profit;
        
        const newTransaction = {
            id: new Date().toISOString() + Math.random(),
            timestamp: new Date().toISOString(),
            type,
            amount: profit,
            previousBalance: state.bankroll,
            newBalance,
            description,
            betId: betWithDetails.id,
        };

        newState.bankroll = newBalance;
        newState.bankHistory.unshift(newTransaction);
    }
    
    await updateAndSyncState(chatId, newState, env);
    await deleteMessage(chatId, state.dialog!.messageId!, env);
    await showMainMenu(chatId, null, env, `✅ Ставка "${betWithDetails.event}" успешно сохранена!\n*Дата добавления:* ${new Date(betWithDetails.createdAt).toLocaleString('ru-RU')}`);
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