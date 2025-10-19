// functions/telegram/matches.ts
import { TelegramUpdate, UserState, Env, HockeyGame } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { getTodaysHockeyGames } from '../services/sportApi';

export const MATCH_PREFIX = 'match|';
const GAMES_PER_PAGE = 5;

const ACTIONS = {
    LIST: 'list',
};

const buildMatchCb = (action: string, page: number) => `${MATCH_PREFIX}${action}|${page}`;

export async function handleMatchesCommand(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const messageId = update.callback_query ? message.message_id : null;
    
    await showMatchesList(message.chat.id, messageId, env, 0);
}

export async function handleMatchesCallback(update: TelegramUpdate, state: UserState, env: Env) {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;

    const [_, action, pageStr] = cb.data.split('|');
    const page = parseInt(pageStr) || 0;

    if (action === ACTIONS.LIST) {
        await showMatchesList(cb.message.chat.id, cb.message.message_id, env, page);
    }
}

async function showMatchesList(chatId: number, messageId: number | null, env: Env, page: number) {
    try {
        if (messageId) {
             await editMessageText(chatId, messageId, "🏒 Загружаю актуальные матчи...", env);
        } else {
             await sendMessage(chatId, "🏒 Загружаю актуальные матчи...", env);
        }

        const games = await getTodaysHockeyGames(env);

        if (games.length === 0) {
            const text = "На сегодня хоккейных матчей не найдено.";
            const keyboard = makeKeyboard([[{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]]);
            if (messageId) await editMessageText(chatId, messageId, text, env, keyboard);
            else await sendMessage(chatId, text, env, keyboard);
            return;
        }

        const totalPages = Math.ceil(games.length / GAMES_PER_PAGE);
        const currentPage = Math.max(0, Math.min(page, totalPages - 1));
        const start = currentPage * GAMES_PER_PAGE;
        const end = start + GAMES_PER_PAGE;
        const gamesOnPage = games.slice(start, end);
        
        const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        let text = `*🏒 Хоккейные матчи на сегодня (${today})*\n\n`;
        gamesOnPage.forEach(game => {
            const gameTime = new Date(game.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
            text += `*${gameTime}* - ${game.teams.home.name} vs ${game.teams.away.name}\n`;
            text += `_${game.league.name}_\n\n`;
        });

        const navButtons = [];
        if (currentPage > 0) navButtons.push({ text: '⬅️ Пред.', callback_data: buildMatchCb(ACTIONS.LIST, currentPage - 1) });
        if (currentPage < totalPages - 1) navButtons.push({ text: 'След. ➡️', callback_data: buildMatchCb(ACTIONS.LIST, currentPage + 1) });

        const keyboard = makeKeyboard([
            navButtons,
            [
                { text: '🔄 Обновить', callback_data: buildMatchCb(ACTIONS.LIST, currentPage) },
                { text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }
            ]
        ]);

        if (messageId) {
            await editMessageText(chatId, messageId, text, env, keyboard);
        } else {
            // This case should be rare, as we send a loading message first
            await sendMessage(chatId, text, env, keyboard);
        }

    } catch (error) {
        console.error("Error in showMatchesList:", error); // Log the detailed error
        const userFriendlyError = error instanceof Error && error.message.includes("Ошибка API")
            ? `🚫 Ошибка при обращении к API матчей. Пожалуйста, проверьте API-ключ и настройки.\n\nДетали: \`${error.message}\``
            : `🚫 Произошла ошибка при загрузке матчей. Попробуйте позже.`;

        const keyboard = makeKeyboard([[{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]]);
        if (messageId) await editMessageText(chatId, messageId, userFriendlyError, env, keyboard);
        else await sendMessage(chatId, userFriendlyError, env, keyboard);
    }
}