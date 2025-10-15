// functions/api/telegram/webhook.ts

// --- TYPE DEFINITIONS ---
import { Bet, BetLeg, BetStatus, BetType, BankTransaction, BankTransactionType, User } from '../../../src/types';
import { SPORTS, BOOKMAKERS, BET_STATUS_OPTIONS, MARKETS_BY_SPORT } from '../../../src/constants';

interface Env {
    TELEGRAM_BOT_TOKEN: string;
    BOT_STATE: KVNamespace;
}

interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

// Simplified UserData stored in KV for the bot
interface UserData {
    email: string;
    nickname: string;
    password_hash: string;
    registeredAt: string;
    referralCode: string;
    buttercups: number;
    status: 'active' | 'blocked';
    bankroll: number;
    bets: Bet[];
    bankHistory: BankTransaction[];
    // We don't store goals in the bot's user data for now to keep it simple
}

interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
    message_id: number;
    from: { id: number; };
    chat: { id: number; type: 'private'; };
    date: number;
    text?: string;
}

interface TelegramCallbackQuery {
    id: string;
    from: { id: number; };
    message: TelegramMessage;
    data: string;
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (context: EventContext<E>) => Response | Promise<Response>;

// --- RISK MANAGEMENT MODEL ---
const calculateRiskManagedStake = (bankroll: number, odds: number): { stake: number; percentage: number } | null => {
  if (bankroll <= 0 || odds <= 1) return null;
  let percentageOfBankroll: number;
  if (odds < 1.5) percentageOfBankroll = 0.025;
  else if (odds < 2.5) percentageOfBankroll = 0.015;
  else if (odds < 4.0) percentageOfBankroll = 0.0075;
  else percentageOfBankroll = 0.005;

  const recommendedStake = bankroll * Math.min(percentageOfBankroll, 0.05);
  if (recommendedStake < 1) return null;
  return { stake: recommendedStake, percentage: percentageOfBankroll * 100 };
};

// --- TELEGRAM API HELPERS ---
async function apiRequest(token: string, method: string, body: object) {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error(`Telegram API error (${method}):`, errorData);
        }
    } catch (error) {
        console.error(`Failed to call Telegram API (${method}):`, error);
    }
}

const sendMessage = (token: string, chatId: number, text: string, reply_markup?: any) =>
    apiRequest(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', reply_markup });

const editMessageText = (token: string, chatId: number, messageId: number, text: string, reply_markup?: any) =>
    apiRequest(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown', reply_markup });

const answerCallbackQuery = (token: string, callbackQueryId: string, text?: string) =>
    apiRequest(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text });

// --- MAIN HANDLER ---
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.TELEGRAM_BOT_TOKEN || !env.BOT_STATE) {
        console.error("FATAL: Telegram Bot Token or KV Namespace is not configured.");
        return new Response('Server configuration error', { status: 500 });
    }

    try {
        const update = await request.json() as TelegramUpdate;
        const message = update.message || update.callback_query?.message;
        const text = update.message?.text?.trim();
        const chatId = message?.chat.id;
        const userId = update.callback_query?.from.id || update.message?.from.id;
        const callbackQueryId = update.callback_query?.id;
        const callbackData = update.callback_query?.data;

        if (!chatId || !userId) return new Response('OK', { status: 200 });
        
        // Always acknowledge callback queries immediately to prevent hanging buttons
        if (callbackQueryId) await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQueryId);

        // --- COMMANDS ---
        if (text && text.startsWith('/')) {
             await env.BOT_STATE.delete(`user:${userId}:action`); // Clear any pending action on new command
             switch (text.split(' ')[0]) {
                case '/start':
                case '/menu':
                    return new Response('OK', { status: 200 }); // The user's menu button will handle this
                // ... other command handlers ...
             }
        }

        // --- CALLBACKS (Button presses) ---
        if (callbackData) {
            // Callback logic will be here
        }

        // --- TEXT REPLIES (Dialogs) ---
        const currentState = await env.BOT_STATE.get(`user:${userId}:action`);
        if (text && currentState) {
            // Dialog logic will be here
        }

    } catch (error) {
        console.error("Webhook Error:", error);
    }
    
    return new Response('OK', { status: 200 }); // Always acknowledge Telegram
};
