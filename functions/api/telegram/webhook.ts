// functions/api/telegram/webhook.ts

// --- TYPE DEFINITIONS ---
// These types are copied/adapted from the frontend to be used in this serverless function.

export enum BetStatus {
    Pending = 'pending',
    Won = 'won',
    Lost = 'lost',
    Void = 'void',
    CashedOut = 'cashed_out',
}

export enum BetType {
    Single = 'single',
    Parlay = 'parlay',
    System = 'system',
}

export interface BetLeg {
    homeTeam: string;
    awayTeam: string;
    market: string;
}

export interface Bet {
    id: string;
    createdAt: string;
    event: string;
    legs: BetLeg[];
    sport: string;
    bookmaker: string;
    betType: BetType;
    stake: number;
    odds: number;
    status: BetStatus;
    profit?: number;
    tags?: string[];
}

export enum BankTransactionType {
    Deposit = 'deposit',
    Withdrawal = 'withdrawal',
    BetWin = 'bet_win',
    BetLoss = 'bet_loss',
    BetVoid = 'bet_void',
    BetCashout = 'bet_cashout',
    Correction = 'correction',
}

export interface BankTransaction {
    id: string;
    timestamp: string;
    type: BankTransactionType;
    amount: number;
    previousBalance: number;
    newBalance: number;
    description: string;
    betId?: string;
}

export interface Goal {
    id: string;
    title: string;
}

export interface User {
    email: string;
    nickname: string;
}

export interface UserBetData {
    user: User;
    bets: Bet[];
    bankroll: number;
    goals: Goal[];
    bankHistory: BankTransaction[];
}


// --- TELEGRAM & CLOUDFLARE TYPES ---

interface Env {
    TELEGRAM_BOT_TOKEN: string;
    BOT_STATE: KVNamespace;
    TELEGRAM_WEBHOOK_SECRET?: string;
}

interface TelegramMessage {
    message_id: number;
    from: { id: number; is_bot: boolean; first_name: string; username: string; };
    chat: { id: number; first_name: string; username: string; type: string; };
    date: number;
    text?: string;
}

interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    edited_message?: TelegramMessage;
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;


// --- UTILITY FUNCTIONS ---

/**
 * Sends a message back to the user via the Telegram Bot API.
 */
async function sendMessage(chatId: number, text: string, env: Env): Promise<Response> {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
    };

    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

/**
 * Generates a summary of the user's betting statistics.
 */
function generateStatsSummary(data: UserBetData): string {
    const settledBets = data.bets.filter(b => b.status !== BetStatus.Pending);
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void).length;
    const winRate = nonVoidBets > 0 ? (wonBets / nonVoidBets) * 100 : 0;

    return `*📊 Ваш отчет по ставкам:*\n\n` +
        `*Банк:* ${data.bankroll.toFixed(2)} ₽\n` +
        `*Общая прибыль:* ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} ₽\n` +
        `*ROI:* ${roi.toFixed(2)}%\n` +
        `*Процент выигрышей:* ${winRate.toFixed(2)}%\n` +
        `*Всего ставок (рассчитанных):* ${settledBets.length}`;
}

// --- BET LOGIC UTILS (Adapted from frontend) ---

const calculateProfit = (bet: Omit<Bet, 'id' | 'createdAt' | 'event'>): number => {
    switch (bet.status) {
        case BetStatus.Won: return bet.stake * (bet.odds - 1);
        case BetStatus.Lost: return -bet.stake;
        case BetStatus.Void: return 0;
        case BetStatus.CashedOut: return bet.profit ?? 0;
        default: return 0;
    }
};

const generateEventString = (legs: BetLeg[], betType: BetType, sport: string): string => {
    if (!legs || legs.length === 0) return 'Пустое событие';
    if (betType === BetType.Single && legs.length === 1) {
        const leg = legs[0];
        return `${leg.homeTeam} vs ${leg.awayTeam} - ${leg.market}`;
    }
    return `Экспресс (${legs.length} событий)`;
};

// --- HANDLERS ---

/**
 * Handles the initial authentication process using a 6-digit code.
 */
async function handleAuth(message: TelegramMessage, env: Env): Promise<Response> {
    const code = message.text?.trim();
    if (!code || !/^\d{6}$/.test(code)) {
        return sendMessage(message.chat.id, "Привет! Для начала работы, пожалуйста, введите 6-значный код, который вы сгенерировали в веб-приложении.", env);
    }

    const kvKey = `tgauth:${code}`;
    const storedDataJSON = await env.BOT_STATE.get(kvKey);

    if (!storedDataJSON) {
        return sendMessage(message.chat.id, "Неверный или истекший код. Пожалуйста, сгенерируйте новый код в настройках веб-приложения.", env);
    }

    const userData: UserBetData = JSON.parse(storedDataJSON);

    // Link chat ID to user data and user email
    await env.BOT_STATE.put(`tgchat:${message.chat.id}`, JSON.stringify(userData));
    await env.BOT_STATE.put(`tgid:${message.chat.id}`, userData.user.email);
    
    // Clean up the auth code
    await env.BOT_STATE.delete(kvKey);

    return sendMessage(message.chat.id, `✅ Успешно! Ваш аккаунт Telegram (${userData.user.email}) привязан. Теперь вы можете управлять своим дневником.\n\nОтправьте /help, чтобы увидеть список команд.`, env);
}

/**
 * Handles commands from an authenticated user.
 */
async function handleCommand(message: TelegramMessage, userDataString: string, env: Env): Promise<Response> {
    const text = message.text?.trim() || '';
    const chatId = message.chat.id;
    let data: UserBetData = JSON.parse(userDataString);

    // Command routing
    if (text.startsWith('/stats')) {
        return sendMessage(chatId, generateStatsSummary(data), env);
    }

    if (text.startsWith('/add')) {
        try {
            // e.g., /add Футбол, Реал vs Барса, П1, 100, 2.15, won
            const parts = text.substring(5).split(',').map(s => s.trim());
            if (parts.length < 5) {
                return sendMessage(chatId, "❌ Неверный формат. Используйте: `/add Спорт, Команда 1 vs Команда 2, Исход, Сумма, Коэф., [статус]`\nНапример: `/add Футбол, Реал vs Барса, П1, 100, 2.15`", env);
            }
            
            const [sport, teams, market, stakeStr, oddsStr, statusStr] = parts;
            const teamParts = teams.split('vs').map(t => t.trim());
            if (teamParts.length !== 2) throw new Error("Укажите команды через 'vs'");

            const newBet: Omit<Bet, 'id' | 'createdAt' | 'event'> = {
                sport,
                legs: [{ homeTeam: teamParts[0], awayTeam: teamParts[1], market }],
                betType: BetType.Single,
                bookmaker: 'Telegram',
                stake: parseFloat(stakeStr),
                odds: parseFloat(oddsStr),
                status: (statusStr as BetStatus) || BetStatus.Pending,
                tags: ['telegram_bot'],
            };

            if (isNaN(newBet.stake) || isNaN(newBet.odds)) throw new Error("Сумма и коэффициент должны быть числами.");
            
            // Replicate frontend logic
            const betForProfitCalc = { ...newBet };
            if (newBet.status !== BetStatus.CashedOut) {
                betForProfitCalc.profit = calculateProfit(betForProfitCalc);
            }

            const betToAdd: Bet = {
                ...betForProfitCalc,
                id: new Date().toISOString() + Math.random(),
                createdAt: new Date().toISOString(),
                event: generateEventString(betForProfitCalc.legs, betForProfitCalc.betType, betForProfitCalc.sport),
                profit: betForProfitCalc.profit,
            };

            data.bets.unshift(betToAdd); // Add to start
            
            // Update bankroll if settled
            if (betToAdd.profit !== undefined && betToAdd.status !== BetStatus.Pending) {
                const profit = betToAdd.profit;
                if(profit !== 0) {
                    const type = profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
                    const newTransaction: BankTransaction = {
                        id: new Date().toISOString() + Math.random(),
                        timestamp: new Date().toISOString(),
                        type,
                        amount: profit,
                        previousBalance: data.bankroll,
                        newBalance: data.bankroll + profit,
                        description: `Ставка (Telegram): ${betToAdd.event}`,
                        betId: betToAdd.id,
                    };
                    data.bankroll = newTransaction.newBalance;
                    data.bankHistory.unshift(newTransaction);
                }
            }

            await env.BOT_STATE.put(`tgchat:${chatId}`, JSON.stringify(data));
            return sendMessage(chatId, `✅ Ставка добавлена:\n*${betToAdd.event}*\nСумма: ${betToAdd.stake} ₽ | Коэф: ${betToAdd.odds}`, env);

        } catch (e) {
            return sendMessage(chatId, `❌ Ошибка добавления ставки: ${(e as Error).message}`, env);
        }
    }
    
    if (text.startsWith('/help')) {
         const helpText = "*🤖 Доступные команды:*\n\n" +
            "*/stats* - Показать вашу текущую статистику.\n\n" +
            "*/add* - Добавить новую одиночную ставку.\n" +
            "*Формат:* `/add Спорт, Команда 1 vs Команда 2, Исход, Сумма, Коэф., [статус]`\n" +
            "_Статус (необязательно):_ `won`, `lost`, `void`. По умолчанию `pending`.\n" +
            "*Пример:* `/add Футбол, Спартак vs ЦСКА, П1, 500, 2.5`";
        return sendMessage(chatId, helpText, env);
    }

    // Default response for any other message
    return sendMessage(chatId, "Неизвестная команда. Отправьте /help, чтобы увидеть список команд.", env);
}


// --- MAIN FUNCTION HANDLER ---

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    // Optional: Secure webhook with a secret token
    if (env.TELEGRAM_WEBHOOK_SECRET) {
        const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
            return new Response('Unauthorized', { status: 401 });
        }
    }

    try {
        const update = await request.json<TelegramUpdate>();
        const message = update.message || update.edited_message;

        if (message?.text) {
            const chatId = message.chat.id;
            
            // Check if user is authenticated
            const userDataString = await env.BOT_STATE.get(`tgchat:${chatId}`);
            
            if (userDataString) {
                // User is authenticated, handle command
                await handleCommand(message, userDataString, env);
            } else {
                // User is not authenticated, handle auth flow
                await handleAuth(message, env);
            }
        }
        
        // Telegram expects a 200 OK response to confirm receipt of the update
        return new Response('OK', { status: 200 });

    } catch (error) {
        console.error('Telegram webhook error:', error);
        // Don't send error details back to Telegram, just log and return OK.
        return new Response('OK', { status: 200 });
    }
};
