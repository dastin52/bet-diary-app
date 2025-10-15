// functions/api/telegram/webhook.ts

// --- TYPE DEFINITIONS ---
interface KVNamespace {
    put(key: string, value: string, options?: { expiration?: number; expirationTtl?: number; metadata?: any; }): Promise<void>;
    get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream"): Promise<string | null>;
    delete(key: string): Promise<void>;
}

interface Env {
    BOT_STATE: KVNamespace;
    TELEGRAM_BOT_TOKEN: string;
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (context: EventContext<E>) => Response | Promise<Response>;

// Telegram API Types
interface TelegramUser { id: number; }
interface TelegramChat { id: number; }
interface TelegramMessage { message_id: number; from: TelegramUser; chat: TelegramChat; date: number; text?: string; }
interface TelegramCallbackQuery { id: string; from: TelegramUser; message: TelegramMessage; data?: string; }
interface TelegramUpdate { update_id: number; message?: TelegramMessage; callback_query?: TelegramCallbackQuery; }

// App-specific Types
interface User {
  email: string;
  nickname: string;
  password_hash: string;
  registeredAt: string;
  referralCode: string;
  buttercups: number;
  status: 'active' | 'blocked';
}
interface RegistrationState {
    step: 'awaiting_nickname' | 'awaiting_email' | 'awaiting_password';
    data: { nickname?: string; email?: string; };
}

// --- KEYBOARDS ---
const welcomeKeyboard = {
    inline_keyboard: [
        [{ text: "✍️ Зарегистрировать новый аккаунт", callback_data: "register" }],
        [{ text: "🔗 Привязать аккаунт с сайта", callback_data: "link_account" }]
    ]
};

const mainMenuKeyboard = {
    inline_keyboard: [
        [{ text: "📊 Просмотр статистики", callback_data: "view_stats" }],
        [{ text: "📝 Добавить ставку", callback_data: "add_bet" }]
    ]
};

// --- TELEGRAM API HELPER ---
const telegramApi = async (token: string, methodName: string, body: object) => {
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/${methodName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const result = await response.json();
            console.error(`Telegram API error (${methodName}):`, result.description);
        }
        return response;
    } catch (error) {
        console.error(`Network error calling Telegram API (${methodName}):`, error instanceof Error ? error.message : String(error));
        return new Response('Network error', { status: 500 });
    }
};

// A mock hashing function. In a real app, use a library like bcrypt on the server.
const mockHash = (password: string) => `hashed_${password}`;

// --- MAIN FUNCTION HANDLER ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    // 1. Critical Environment Checks
    if (!env.TELEGRAM_BOT_TOKEN || !env.BOT_STATE) {
        console.error("FATAL: Environment variables or KV bindings are not set.");
        return new Response('OK'); // Respond OK to prevent Telegram retries
    }
    const token = env.TELEGRAM_BOT_TOKEN;
    const kv = env.BOT_STATE;

    try {
        const update = await request.json() as TelegramUpdate;

        // Handle button presses (Callback Queries)
        if (update.callback_query) {
            const { id: callbackQueryId, from, message, data: callbackData } = update.callback_query;
            const chatId = message.chat.id;

            await telegramApi(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId });

            switch (callbackData) {
                case 'register':
                    const registrationState: RegistrationState = { step: 'awaiting_nickname', data: {} };
                    await kv.put(`state:tg:${from.id}`, JSON.stringify(registrationState));
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Отлично! Давайте создадим аккаунт.\n\nКакой у вас будет никнейм? (мин. 3 символа)" });
                    break;
                case 'link_account':
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Чтобы привязать аккаунт, сгенерируйте 6-значный код в приложении ('Настройки' ➔ 'Интеграция с Telegram') и отправьте его мне." });
                    break;
                case 'view_stats':
                case 'add_bet':
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "✅ Этот функционал находится в разработке и скоро будет доступен!" });
                    break;
            }
            return new Response('OK');
        }

        // Handle regular text messages
        if (update.message) {
            const { chat, from, text } = update.message;
            if (!text) return new Response('OK');

            const chatId = chat.id;
            const fromId = from.id;
            const messageText = text.trim();

            // Check if user is in a registration flow
            const stateJson = await kv.get(`state:tg:${fromId}`);
            if (stateJson) {
                const state: RegistrationState = JSON.parse(stateJson);
                switch (state.step) {
                    case 'awaiting_nickname':
                        if (messageText.length < 3) {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "⚠️ Никнейм должен быть не менее 3 символов. Попробуйте еще раз." });
                            return new Response('OK');
                        }
                        if (await kv.get(`user:nickname:${messageText.toLowerCase()}`)) {
                             await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "⚠️ Этот никнейм уже занят. Пожалуйста, выберите другой." });
                             return new Response('OK');
                        }
                        state.data.nickname = messageText;
                        state.step = 'awaiting_email';
                        await kv.put(`state:tg:${fromId}`, JSON.stringify(state));
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Отлично. Теперь введите ваш email:" });
                        break;

                    case 'awaiting_email':
                        const email = messageText.toLowerCase();
                        if (!/^\S+@\S+\.\S+$/.test(email)) {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "⚠️ Кажется, это не похоже на email. Пожалуйста, проверьте и введите еще раз." });
                            return new Response('OK');
                        }
                         if (await kv.get(`user:email:${email}`)) {
                             await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "⚠️ Пользователь с таким email уже существует. Вы можете привязать аккаунт через стартовое меню." });
                             await kv.delete(`state:tg:${fromId}`);
                             return new Response('OK');
                        }
                        state.data.email = email;
                        state.step = 'awaiting_password';
                        await kv.put(`state:tg:${fromId}`, JSON.stringify(state));
                        await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Хорошо. Теперь придумайте пароль (мин. 6 символов):" });
                        break;
                    
                    case 'awaiting_password':
                        if (messageText.length < 6) {
                            await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "⚠️ Пароль слишком короткий. Он должен быть не менее 6 символов. Попробуйте еще раз." });
                            return new Response('OK');
                        }
                        const newUser: User = {
                            email: state.data.email!,
                            nickname: state.data.nickname!,
                            password_hash: mockHash(messageText),
                            registeredAt: new Date().toISOString(),
                            referralCode: `${state.data.nickname!.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                            buttercups: 0,
                            status: 'active',
                        };
                        // Store the new user data
                        await kv.put(`user:email:${newUser.email}`, JSON.stringify(newUser));
                        await kv.put(`user:nickname:${newUser.nickname.toLowerCase()}`, newUser.email);
                        // Link Telegram ID to email
                        await kv.put(`user:tg:${fromId}`, newUser.email);
                        // Clean up state
                        await kv.delete(`state:tg:${fromId}`);
                        
                        await telegramApi(token, 'sendMessage', {
                            chat_id: chatId,
                            text: `🎉 Регистрация завершена! Ваш аккаунт для ${newUser.email} создан и привязан.`,
                            reply_markup: mainMenuKeyboard
                        });
                        break;
                }
                return new Response('OK');
            }

            // Standard command/message handling
            if (messageText === '/start') {
                const userEmail = await kv.get(`user:tg:${fromId}`);
                if (userEmail) {
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `С возвращением! Вы авторизованы как ${userEmail}.`, reply_markup: mainMenuKeyboard });
                } else {
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "👋 Добро пожаловать в Дневник Ставок!", reply_markup: welcomeKeyboard });
                }
            } else if (/^\d{6}$/.test(messageText)) { // Handle 6-digit auth code
                const code = messageText;
                const authKey = `authcode:${code}`;
                const email = await kv.get(authKey);

                if (email) {
                    await kv.put(`user:tg:${fromId}`, email);
                    await kv.delete(authKey);
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `✅ Аккаунт для ${email} успешно привязан!`, reply_markup: mainMenuKeyboard });
                } else {
                    await telegramApi(token, 'sendMessage', { chat_id: chatId, text: `❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый код на сайте и попробуйте снова.` });
                }
            } else {
                 await telegramApi(token, 'sendMessage', { chat_id: chatId, text: "Я не понял команду. Пожалуйста, используйте /start, чтобы увидеть доступные опции." });
            }
        }

    } catch (e: any) {
        console.error("--- UNHANDLED FATAL ERROR IN WEBHOOK ---");
        console.error("Error message:", e.message);
        console.error("Error stack:", e.stack);
    }
    
    return new Response('OK');
};
