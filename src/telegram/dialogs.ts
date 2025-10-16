// src/telegram/dialogs.ts
import { Env, UserState, TelegramMessage, User } from './types';
import { setUserState, normalizeState } from './state';
import { showMainMenu, showStartMenu } from './telegramApi';
import { GoogleGenAI } from "@google/genai";

// A mock hashing function. In a real app, use a library like bcrypt on the server.
const mockHash = (password: string) => `hashed_${password}`;

export async function handleDialog(chatId: number, text: string, state: UserState, env: Env, messageId?: number) {
    if (!state.dialog) return;

    const dialog = state.dialog;
    const currentMessageId = messageId || dialog.messageId!;

    try {
        switch (dialog.step) {
            
            // --- Special "start" dialog commands from buttons ---
            case 'start_login_password':
                dialog.step = 'login_email';
                dialog.messageId = currentMessageId;
                await setUserState(chatId, state, env);
                await env.TELEGRAM.editMessageText({
                    chat_id: chatId, message_id: currentMessageId, text: "Введите ваш *email*:", parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:login" }]] }
                });
                return;

            case 'start_login_code':
                 state.dialog = null; 
                await setUserState(chatId, state, env);
                await env.TELEGRAM.editMessageText({
                    chat_id: chatId, message_id: currentMessageId,
                    text: "Пожалуйста, сгенерируйте 6-значный код в веб-приложении ('Настройки' ➡️ 'Интеграция с Telegram') и отправьте его мне.",
                    reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_login" }]] }
                });
                return;

            // --- REGISTRATION ---
            case 'register_email': {
                const existingUser = await env.BOT_STATE.get(`user:${text.toLowerCase()}`);
                if (existingUser) {
                    await env.TELEGRAM.sendMessage({ chat_id: chatId, text: "Этот email уже занят. Попробуйте другой." });
                    return;
                }
                dialog.data.email = text.toLowerCase();
                dialog.step = 'register_nickname';
                await setUserState(chatId, state, env);
                await env.TELEGRAM.editMessageText({
                    chat_id: chatId, message_id: dialog.messageId, text: "Отлично! Теперь придумайте *никнейм*:", parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:start" }]] }
                });
                break;
            }
            case 'register_nickname': {
                dialog.data.nickname = text;
                dialog.step = 'register_password';
                await setUserState(chatId, state, env);
                await env.TELEGRAM.editMessageText({
                    chat_id: chatId, message_id: dialog.messageId, text: "Теперь придумайте *пароль* (рекомендуем удалить сообщение после ввода):", parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:start" }]] }
                });
                break;
            }
            case 'register_password': {
                const newUser: User = {
                    email: dialog.data.email, nickname: dialog.data.nickname,
                    password_hash: mockHash(text), registeredAt: new Date().toISOString(),
                    referralCode: `${dialog.data.nickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                    buttercups: 0, status: 'active',
                };
                
                const finalState: UserState = { ...normalizeState(null), user: newUser };

                await env.BOT_STATE.put(`user:${newUser.email}`, JSON.stringify(finalState));
                
                const userListJson = await env.BOT_STATE.get('users:list');
                const userList = userListJson ? JSON.parse(userListJson) : [];
                if (!userList.includes(newUser.email)) {
                    userList.push(newUser.email);
                    await env.BOT_STATE.put('users:list', JSON.stringify(userList));
                }
                
                state.dialog = null;
                await setUserState(chatId, finalState, env);
                
                await env.TELEGRAM.editMessageText({
                    chat_id: chatId, message_id: dialog.messageId, text: `🎉 *Регистрация завершена!* Добро пожаловать, ${newUser.nickname}!`, parse_mode: 'Markdown'
                });
                await showMainMenu(chatId, finalState, env);
                break;
            }
            
            // --- LOGIN ---
            case 'login_email': {
                const userStateStr = await env.BOT_STATE.get(`user:${text.toLowerCase()}`);
                if (!userStateStr) {
                    await env.TELEGRAM.sendMessage({ chat_id: chatId, text: "Пользователь с таким email не найден. Попробуйте снова или зарегистрируйтесь." });
                    return;
                }
                dialog.data.email = text.toLowerCase();
                dialog.step = 'login_password';
                await setUserState(chatId, state, env);
                await env.TELEGRAM.editMessageText({
                    chat_id: chatId, message_id: dialog.messageId, text: "Введите ваш *пароль*:", parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:login" }]] }
                });
                break;
            }
            case 'login_password': {
                const userStateStr = await env.BOT_STATE.get(`user:${dialog.data.email}`);
                const finalState = normalizeState(JSON.parse(userStateStr!));
                
                if (finalState.user?.password_hash === mockHash(text)) {
                    state.dialog = null;
                    await setUserState(chatId, finalState, env);
                     await env.TELEGRAM.editMessageText({
                        chat_id: chatId, message_id: dialog.messageId, text: `✅ *Вход выполнен!* С возвращением, ${finalState.user.nickname}!`, parse_mode: 'Markdown'
                    });
                    await showMainMenu(chatId, finalState, env);
                } else {
                     await env.TELEGRAM.sendMessage({ chat_id: chatId, text: "Неверный пароль. Попробуйте снова." });
                }
                break;
            }
            
            // --- AI CHAT ---
            case 'ai_chat_active': {
                if (messageId) { // Ensure it's a new message
                    const thinkingMsg = await env.TELEGRAM.sendMessage({
                        chat_id: chatId, text: "🤖 Думаю...",
                    });
                    
                    dialog.data.history.push({ role: 'user', text: text });

                    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash', contents: dialog.data.history
                    });
                    const aiText = response.text;
                    dialog.data.history.push({ role: 'model', text: aiText });
                    
                    await setUserState(chatId, state, env);
                    await env.TELEGRAM.editMessageText({
                        chat_id: chatId, message_id: thinkingMsg.result.message_id, text: aiText
                    });
                }
                break;
            }
        }
    } catch (e) {
        // ... (error handling)
    }
}
