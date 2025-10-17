// functions/telegram/competition.ts
import { TelegramCallbackQuery, Env, Bet, User } from './types';
import { editMessageText } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { generateLeaderboards } from './competitionData';
// FIX: Import KV-compatible data access functions instead of localStorage-based ones.
import { getUsers, findUserByEmail } from '../data/userStore';


// FIX: This function now correctly uses KV to fetch all user data, although it remains inefficient for large user bases.
async function getAllUsersWithBetsFromKV(env: Env): Promise<{ user: User, bets: Bet[] }[]> {
    const users = await getUsers(env);
    const usersWithBets: { user: User, bets: Bet[] }[] = [];
    for (const user of users) {
        const state = await findUserByEmail(user.email, env);
        if (state && state.user) {
            usersWithBets.push({ user: state.user, bets: state.bets });
        }
    }
    return usersWithBets;
}


export async function showCompetitions(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    // Acknowledge that this is a placeholder for a complex operation
    await editMessageText(chatId, messageId, "🔄 Загрузка данных соревнований...", env);
    
    // This is the problematic part in a real serverless setup.
    const allUsersWithBets = await getAllUsersWithBetsFromKV(env);

    const leaderboards = generateLeaderboards(allUsersWithBets, 'week'); // Default to weekly
    
    const roiLeaders = leaderboards.roi.slice(0, 5);

    let text = '*🏆 Еженедельные Соревнования*\n\n';
    text += '*Короли ROI (Топ-5):*\n';
    if (roiLeaders.length > 0) {
        roiLeaders.forEach(p => {
            text += `${p.stats.rank}. ${p.user.nickname} - *${p.stats.roi.toFixed(2)}%*\n`;
        });
    } else {
        text += '_Пока нет участников в таблице лидеров. Возможно, бот не смог загрузить данные всех игроков._\n';
    }

    text += '\n(Функционал соревнований в разработке)';

    const keyboard = makeKeyboard([
        [{ text: '◀️ Главное меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}