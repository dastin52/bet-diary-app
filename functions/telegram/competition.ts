// functions/telegram/competition.ts
import { TelegramCallbackQuery, Env, Bet, User } from './types';
import { editMessageText } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { generateLeaderboards } from './competitionData';
// NOTE: These functions use localStorage and will NOT work in a serverless environment.
// This is a placeholder implementation that would need to be replaced with a proper database/KV store solution for production.
import { getUsers } from '../data/userStore';
import { loadUserData } from '../data/betStore';


// This function has a major architectural issue for serverless: it tries to load all users' data,
// which is inefficient and relies on a `localStorage`-based store. For the purpose of fixing
// compilation errors, we'll implement it, but it would need a redesign for production.
async function getAllUsersWithBetsFromKV(env: Env): Promise<{ user: User, bets: Bet[] }[]> {
    // A proper implementation would list keys from the `betdata:` prefix in KV
    // and fetch them. The current `getUsers` and `loadUserData` are not designed for this.
    // We will return an empty array to prevent runtime errors and allow compilation.
    console.warn("`getAllUsersWithBetsFromKV` is not implemented for production and will return no users.");
    return [];
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
