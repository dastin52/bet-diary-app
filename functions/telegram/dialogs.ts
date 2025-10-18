// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, DialogState, Bet, BetType, BetStatus, GoalMetric } from './types';
import { editMessageText, sendMessage, deleteMessage, reportError } from './telegramApi';
import { makeKeyboard, showMainMenu } from './ui';
import { addBetToState, setUserState, updateAndSyncState, addGoalToState } from './state';
import { BOOKMAKERS, COMMON_ODDS, SPORTS } from '../constants';
import { UseBetsReturn } from '../../src/hooks/useBets'; // Re-using type from frontend

async function callApiProxyForBot(endpoint: string, payload: object, env: Env) {
    const ai = new (require('@google/genai').GoogleGenAI)({ apiKey: env.GEMINI_API_KEY });
    let responseData;
    switch (endpoint) {
        case 'generateContent':
        default:
            const result = await ai.models.generateContent(payload);
            responseData = { text: result.text, sources: result.candidates?.[0]?.groundingMetadata?.groundingChunks };
            break;
    }
    return responseData;
}


export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const chatId = message.chat.id;

    if (!state.dialog) {
        // Should not happen, but as a safeguard
        await showMainMenu(chatId, null, env);
        return;
    }
    
    // Use a router for different dialog types
    switch (state.dialog.type) {
        case 'add_bet':
            await continueAddBetDialog(update, state, env);
            break;
        case 'add_goal':
            await continueAddGoalDialog(update, state, env);
            break;
        case 'ai_chat':
            await continueAiChatDialog(update, state, env);
            break;
        default:
            // Clean up if dialog type is unknown
            await setUserState(chatId, { ...state, dialog: null }, env);
            await showMainMenu(chatId, state.dialog.messageId, env);
    }
}


// --- ADD BET DIALOG ---

export async function startAddBetDialog(chatId: number, state: UserState, env: Env, messageId: number | null = null) {
    const dialogState: DialogState = {
        type: 'add_bet',
        step: 'ask_sport',
        data: { legs: [] },
    };
    const newState = { ...state, dialog: dialogState };
    
    const text = '📝 *Новая ставка*\n\nВыберите вид спорта:';
    const keyboard = makeKeyboard([
        SPORTS.slice(0, 3).map(s => ({ text: s, callback_data: s })),
        SPORTS.slice(3, 6).map(s => ({ text: s, callback_data: s })),
        SPORTS.slice(6).map(s => ({ text: s, callback_data: s })),
        [{ text: '❌ Отмена', callback_data: 'cancel'}]
    ]);

    let sentMessage;
    if (messageId) {
        sentMessage = await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        sentMessage = await sendMessage(chatId, text, env, keyboard);
    }
    
    newState.dialog!.messageId = sentMessage.result.message_id;
    await setUserState(chatId, newState, env);
}

async function continueAddBetDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = (update.message || update.callback_query?.message)!.chat.id;
    const dialog = state.dialog!;
    const messageId = dialog.messageId!;
    const text = update.message?.text;
    const cbData = update.callback_query?.data;

    if (cbData === 'cancel') {
        await deleteMessage(chatId, messageId, env);
        await setUserState(chatId, { ...state, dialog: null }, env);
        await showMainMenu(chatId, null, env, "Добавление ставки отменено.");
        return;
    }

    try {
        let nextStep = dialog.step;
        const newData = { ...dialog.data };
        
        switch (dialog.step) {
            case 'ask_sport':
                if (!cbData || !SPORTS.includes(cbData)) return;
                newData.sport = cbData;
                nextStep = 'ask_teams';
                await editMessageText(chatId, messageId, `*${newData.sport}*\n\nВведите команды/участников через дефис (e.g., \`Команда 1 - Команда 2\`)`, env);
                break;

            case 'ask_teams':
                if (!text || !text.includes('-')) {
                    await sendMessage(chatId, 'Неверный формат. Пожалуйста, используйте "Команда 1 - Команда 2".', env);
                    return;
                }
                const [home, away] = text.split('-').map(t => t.trim());
                newData.legs.push({ homeTeam: home, awayTeam: away });
                nextStep = 'ask_market';
                await editMessageText(chatId, messageId, `*${home} - ${away}*\n\nВведите исход (например, \`П1\`, \`Тотал > 2.5\`)`, env);
                break;
            
            case 'ask_market':
                if (!text) return;
                newData.legs[newData.legs.length - 1].market = text;
                nextStep = 'ask_stake';
                await editMessageText(chatId, messageId, `*Исход: ${text}*\n\nВведите сумму ставки:`, env);
                break;
            
            case 'ask_stake':
                 if (!text || isNaN(parseFloat(text)) || parseFloat(text) <= 0) {
                    await sendMessage(chatId, 'Пожалуйста, введите положительное число.', env);
                    return;
                }
                newData.stake = parseFloat(text);
                nextStep = 'ask_odds';
                 await editMessageText(chatId, messageId, `*Сумма: ${newData.stake} ₽*\n\nВыберите коэффициент или введите свой:`, env, makeKeyboard([
                    COMMON_ODDS.map(o => ({text: o.toString(), callback_data: o.toString()}))
                ]));
                break;

            case 'ask_odds':
                const oddsVal = parseFloat(cbData || text || '');
                if (isNaN(oddsVal) || oddsVal <= 1) {
                    await sendMessage(chatId, 'Коэффициент должен быть числом больше 1.', env);
                    return;
                }
                newData.odds = oddsVal;
                nextStep = 'ask_bookmaker';
                await editMessageText(chatId, messageId, `*Коэффициент: ${newData.odds}*\n\nВыберите букмекера:`, env, makeKeyboard([
                    BOOKMAKERS.slice(0,3).map(b => ({text: b, callback_data: b})),
                    BOOKMAKERS.slice(3,6).map(b => ({text: b, callback_data: b})),
                ]));
                break;

            case 'ask_bookmaker':
                if (!cbData) return;
                newData.bookmaker = cbData;
                nextStep = 'confirm';

                const leg = newData.legs[0];
                const summary = `*Проверьте данные:*
- *Событие:* ${leg.homeTeam} - ${leg.awayTeam}
- *Исход:* ${leg.market}
- *Сумма:* ${newData.stake} ₽
- *Коэф.:* ${newData.odds}
- *Букмекер:* ${newData.bookmaker}`;
                await editMessageText(chatId, messageId, summary, env, makeKeyboard([
                    [{ text: '✅ Сохранить', callback_data: 'confirm' }],
                    [{ text: '❌ Отмена', callback_data: 'cancel' }]
                ]));
                break;

            case 'confirm':
                if (cbData !== 'confirm') return;

                const finalBet: Omit<Bet, 'id'|'createdAt'|'event'> = {
                    sport: newData.sport,
                    legs: newData.legs,
                    bookmaker: newData.bookmaker,
                    betType: BetType.Single, // Simple dialog only supports singles for now
                    stake: newData.stake,
                    odds: newData.odds,
                    status: BetStatus.Pending,
                };

                const finalState = addBetToState(state, finalBet);
                finalState.dialog = null;
                await updateAndSyncState(chatId, finalState, env);

                await deleteMessage(chatId, messageId, env);
                await showMainMenu(chatId, null, env, "✅ Ставка успешно добавлена!");
                return; // End of dialog
        }

        // Update state with new step and data
        await setUserState(chatId, { ...state, dialog: { ...dialog, step: nextStep, data: newData }}, env);
        
    } catch (error) {
        await reportError(chatId, env, 'Add Bet Dialog', error);
        await setUserState(chatId, { ...state, dialog: null }, env);
    }
}

// --- AI CHAT DIALOG ---
export async function startAiChatDialog(chatId: number, state: UserState, env: Env) {
    const dialogState: DialogState = { type: 'ai_chat', step: 'active', data: { history: [] } };
    const sentMessage = await sendMessage(chatId, '🤖 *Чат с AI-аналитиком*\n\nЗадайте любой вопрос о вашей статистике или предстоящих матчах. Чтобы завершить диалог, отправьте /exit.', env);
    dialogState.messageId = sentMessage.result.message_id;
    await setUserState(chatId, { ...state, dialog: dialogState }, env);
}

async function continueAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message;
    if (!message || !message.text) return;
    const chatId = message.chat.id;

    if (message.text === '/exit') {
        await setUserState(chatId, { ...state, dialog: null }, env);
        await sendMessage(chatId, 'Чат с AI завершен.', env);
        await showMainMenu(chatId, null, env);
        return;
    }
    
    await sendMessage(chatId, '_AI думает..._', env);

    const history = state.dialog?.data.history || [];
    const newHistory = [...history, { role: 'user', text: message.text }];

    const analytics = (require('../telegram/analytics')).calculateAnalytics(state);
    
    // Mocking this call since it depends on frontend types and logic
    const generalSystemInstruction = (currentDate: string) => `Вы — эксперт-аналитик по спортивным ставкам. Сегодняшняя дата: ${currentDate}. Всегда используй эту дату как точку отсчета для любых запросов о текущих или будущих событиях. Отвечай на русском языке.`;
    const analyticsToText = (a: any) => `Вот сводные данные по ставкам пользователя для анализа:
- Общая прибыль: ${a.totalProfit.toFixed(2)}
- ROI: ${a.roi.toFixed(2)}%`;

    const contents = newHistory.map((msg: any) => ({ role: msg.role, parts: [{ text: msg.text }] }));
    if (contents.length === 1 && (contents[0].parts[0].text.toLowerCase().includes('эффективность') || contents[0].parts[0].text.toLowerCase().includes('статистику'))) {
        contents[0].parts[0].text = `${analyticsToText(analytics)}\n\n${contents[0].parts[0].text}`;
    }

    const response = await callApiProxyForBot('generateContent', {
        model: "gemini-2.5-flash",
        contents: contents,
        config: { systemInstruction: generalSystemInstruction(new Date().toLocaleDateString('ru-RU')) },
        tools: [{googleSearch: {}}],
    }, env);

    await sendMessage(chatId, response.text, env);

    const finalHistory = [...newHistory, { role: 'model', text: response.text }];
    await setUserState(chatId, { ...state, dialog: { ...state.dialog!, data: { history: finalHistory } } }, env);
}


// --- ADD GOAL DIALOG ---

export async function startAddGoalDialog(chatId: number, state: UserState, env: Env, messageId: number) {
    const dialogState: DialogState = { type: 'add_goal', step: 'ask_title', data: {}, messageId };
    await editMessageText(chatId, messageId, '📝 *Новая цель*\n\nВведите название цели (например, "Достичь +5000₽ профита в футболе"):', env);
    await setUserState(chatId, { ...state, dialog: dialogState }, env);
}

async function continueAddGoalDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = (update.message || update.callback_query?.message)!.chat.id;
    const dialog = state.dialog!;
    const messageId = dialog.messageId!;
    const text = update.message?.text;
    const cbData = update.callback_query?.data;

     if (cbData === 'cancel') {
        await deleteMessage(chatId, messageId, env);
        await setUserState(chatId, { ...state, dialog: null }, env);
        await (require('./goals')).startManageGoals(update, state, env);
        return;
    }

    let nextStep = dialog.step;
    const newData = { ...dialog.data };
    
    switch(dialog.step) {
        case 'ask_title':
            if(!text) return;
            newData.title = text;
            nextStep = 'ask_metric';
            await editMessageText(chatId, messageId, `*${newData.title}*\n\nВыберите метрику:`, env, makeKeyboard([
                [{text: 'Прибыль (₽)', callback_data: GoalMetric.Profit}, {text: 'ROI (%)', callback_data: GoalMetric.ROI}],
                [{text: 'Процент побед (%)', callback_data: GoalMetric.WinRate}, {text: 'Количество ставок', callback_data: GoalMetric.BetCount}],
            ]));
            break;
        
        case 'ask_metric':
            if(!cbData) return;
            newData.metric = cbData;
            nextStep = 'ask_target';
            await editMessageText(chatId, messageId, `*Метрика: ${cbData}*\n\nВведите целевое значение:`, env);
            break;

        case 'ask_target':
            if (!text || isNaN(parseFloat(text))) {
                await sendMessage(chatId, 'Пожалуйста, введите число.', env);
                return;
            }
            newData.targetValue = parseFloat(text);
            nextStep = 'ask_deadline';
            await editMessageText(chatId, messageId, `*Цель: ${newData.targetValue}*\n\nВведите дедлайн в формате ГГГГ-ММ-ДД:`, env);
            break;

        case 'ask_deadline':
            if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text) || isNaN(new Date(text).getTime())) {
                 await sendMessage(chatId, 'Неверный формат даты. Используйте ГГГГ-ММ-ДД.', env);
                 return;
            }
            newData.deadline = text;
            nextStep = 'confirm';
            const summary = `*Проверьте цель:*
- *Название:* ${newData.title}
- *Метрика:* ${newData.metric}
- *Цель:* ${newData.targetValue}
- *Дедлайн:* ${newData.deadline}`;
            await editMessageText(chatId, messageId, summary, env, makeKeyboard([
                [{text: '✅ Создать', callback_data: 'confirm'}],
                [{text: '❌ Отмена', callback_data: 'cancel'}]
            ]));
            break;

        case 'confirm':
            if (cbData !== 'confirm') return;
            
            const finalState = addGoalToState(state, {
                title: newData.title,
                metric: newData.metric,
                targetValue: newData.targetValue,
                deadline: newData.deadline,
                scope: { type: 'all' },
            });
            finalState.dialog = null;
            await updateAndSyncState(chatId, finalState, env);

            await sendMessage(chatId, "✅ Цель успешно создана!", env);
            await (require('./goals')).startManageGoals({ message: { chat: {id: chatId}, from: {id: 0, is_bot: false, first_name:''}, message_id: 0, date: 0 } }, finalState, env);
            await deleteMessage(chatId, messageId, env);
            return;
    }

    await setUserState(chatId, { ...state, dialog: { ...dialog, step: nextStep, data: newData }}, env);
}
