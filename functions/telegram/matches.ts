// functions/telegram/matches.ts
import { TelegramUpdate, UserState, Env, SportGame } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { getTodaysGamesBySport } from '../services/sportApi';
import { GoogleGenAI } from "@google/genai";

export const MATCH_PREFIX = 'match|';
export const MATCH_SPORT_PREFIX = 'match_sport|';

const LEAGUES_PER_PAGE = 5;

const ACTIONS = {
    LIST: 'list',
    SELECT_SPORT: 'select_sport',
};

const buildMatchCb = (sport: string, action: string, page: number) => `${MATCH_PREFIX}${sport}|${action}|${page}`;
const buildSportSelectionCb = (sport: string) => `${MATCH_SPORT_PREFIX}${sport}`;

const AVAILABLE_SPORTS = [
    { key: 'hockey', label: '🏒 Хоккей' },
    { key: 'football', label: '⚽️ Футбол' },
    { key: 'basketball', label: '🏀 Баскетбол' },
    { key: 'nba', label: '🏀 NBA' },
];

/**
 * Returns an emoji based on the match status short code.
 * @param status - The status object from the API.
 * @returns An emoji string: 🔴 for live, 🏁 for finished, ⏳ for scheduled.
 */
const getMatchStatusEmoji = (status: { short: string } | undefined): string => {
    if (!status) return '⏳'; // Default to scheduled/unknown

    switch (status.short) {
        // Live statuses from various sports
        case '1H': // Halftime
        case 'HT':
        case '2H':
        case 'ET': // Extra Time
        case 'BT': // Break Time
        case 'P':  // Penalties
        case 'LIVE':
        case 'INTR': // Interrupted
            return '🔴'; // Live

        // Finished statuses
        case 'FT': // Finished
        case 'AET': // Finished after Extra Time
        case 'PEN': // Finished after Penalties
            return '🏁'; // Finished

        // Concluded but not standard finished (e.g., postponed, canceled)
        case 'POST': // Postponed
        case 'CANC': // Canceled
        case 'ABD':  // Abandoned
        case 'AWD':  // Awarded
        case 'WO':   // Walkover
            return '🏁';

        // Scheduled statuses
        case 'NS': // Not Started
        case 'TBD': // To Be Defined
        default:
            return '⏳'; // Scheduled
    }
};

/**
 * Translates a list of team names to Russian using the Gemini API, with a caching layer.
 * This function is designed to be extremely robust and fall back gracefully.
 * @param teamNames - An array of unique team names.
 * @param env - The environment object with API keys and KV store.
 * @returns A promise that resolves to a record mapping original names to translated names.
 */
export async function translateTeamNames(teamNames: string[], env: Env): Promise<Record<string, string>> {
    if (!teamNames || teamNames.length === 0) {
        return {};
    }

    const finalTranslations: Record<string, string> = {};
    const namesToTranslate: string[] = [];
    const translationCacheKeys: Record<string, string> = {};

    // 1. Check cache for existing translations
    await Promise.all(teamNames.map(async (name) => {
        // Create a consistent, safe key
        const key = `translation:en-ru:${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        translationCacheKeys[name] = key;
        const cachedTranslation = await env.BOT_STATE.get(key);
        if (cachedTranslation) {
            finalTranslations[name] = cachedTranslation;
        } else {
            namesToTranslate.push(name);
        }
    }));

    // 2. If all names were cached, we are done
    if (namesToTranslate.length === 0) {
        console.log(`[Cache HIT] All ${teamNames.length} team names found in cache.`);
        return finalTranslations;
    }

    console.log(`[Cache MISS] Need to translate ${namesToTranslate.length} new names.`);

    // 3. Translate the remaining uncached names
    try {
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

        const prompt = `Translate the following team names into Russian. Return ONLY a valid JSON object mapping the original name to the translated name. Example: {"New York Rangers": "Нью-Йорк Рейнджерс"}.
Team names: ${namesToTranslate.join(', ')}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        if (!response || typeof response.text !== 'string' || response.text.trim() === '') {
            console.warn("AI translation response is invalid or empty. Returning only cached translations.");
            return finalTranslations;
        }

        const text = response.text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (!jsonMatch || !jsonMatch[0]) {
            console.warn("No JSON object found in AI translation response. Text was:", text);
            return finalTranslations;
        }
        
        let newTranslations: Record<string, string> = {};
        try {
            newTranslations = JSON.parse(jsonMatch[0]);
            if (typeof newTranslations !== 'object' || newTranslations === null || Array.isArray(newTranslations)) {
                console.warn("Parsed translation is not a valid object. Parsed value:", newTranslations);
                return finalTranslations;
            }
        } catch (parseError) {
            console.error("Failed to parse JSON from AI translation response. Matched JSON string was:", jsonMatch[0], "Error:", parseError);
            return finalTranslations;
        }

        // 4. Update the final translations object and write new translations to cache
        const cachePromises: Promise<void>[] = [];
        for (const originalName in newTranslations) {
            // Ensure we only process names we asked for
            if (Object.prototype.hasOwnProperty.call(newTranslations, originalName) && namesToTranslate.includes(originalName)) {
                const translatedName = newTranslations[originalName];
                finalTranslations[originalName] = translatedName;
                
                const key = translationCacheKeys[originalName];
                if (key) {
                    // Cache the new translation with no expiration
                    cachePromises.push(env.BOT_STATE.put(key, translatedName));
                }
            }
        }
        
        // Await cache writes to ensure they complete in the serverless environment
        await Promise.all(cachePromises);
        console.log(`[Cache WRITE] Stored ${cachePromises.length} new translations.`);

    } catch (apiError) {
        console.error("Gemini API call for translation failed:", apiError);
        // Fallback on any API error: return only the cached translations
    }

    // Return all translations (cached + newly fetched)
    return finalTranslations;
}



export async function handleMatchesCommand(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    await showSportSelectionMenu(message.chat.id, message.message_id, env);
}

export async function handleSportSelectionCallback(update: TelegramUpdate, state: UserState, env: Env) {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;
    const sport = cb.data.replace(MATCH_SPORT_PREFIX, '');
    await showMatchesList(cb.message.chat.id, cb.message.message_id, env, sport, 0);
}

export async function handleMatchesCallback(update: TelegramUpdate, state: UserState, env: Env) {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;

    const [_, sport, action, pageStr] = cb.data.split('|');
    const page = parseInt(pageStr) || 0;

    if (action === ACTIONS.LIST) {
        await showMatchesList(cb.message.chat.id, cb.message.message_id, env, sport, page);
    }
}

export async function showSportSelectionMenu(chatId: number, messageId: number, env: Env) {
    const text = "Выберите вид спорта для просмотра матчей:";
    const sportButtons = AVAILABLE_SPORTS.map(sport => ({
        text: sport.label,
        callback_data: buildSportSelectionCb(sport.key),
    }));
    const keyboard = makeKeyboard([
        sportButtons,
        [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}


async function showMatchesList(chatId: number, messageId: number | null, env: Env, sport: string, page: number) {
    let loadingMessageId = messageId;
    try {
        const sportLabel = AVAILABLE_SPORTS.find(s => s.key === sport)?.label || sport;
        if (loadingMessageId) {
            await editMessageText(chatId, loadingMessageId, `Загружаю актуальные матчи... (${sportLabel})`, env);
        } else {
            const sentMessage = await sendMessage(chatId, `Загружаю актуальные матчи... (${sportLabel})`, env);
            loadingMessageId = sentMessage.result.message_id;
        }

        const games = await getTodaysGamesBySport(sport, env);

        if (games.length === 0) {
            const text = `На сегодня матчей по виду спорта "${sportLabel}" не найдено.`;
            const keyboard = makeKeyboard([[{ text: '◀️ Назад к выбору спорта', callback_data: CB.MATCHES }], [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]]);
            if (loadingMessageId) await editMessageText(chatId, loadingMessageId, text, env, keyboard);
            return;
        }

        // Translate team names
        const teamNames = games.flatMap(game => [
            game?.teams?.home?.name,
            game?.teams?.away?.name
        ]).filter((name): name is string => typeof name === 'string' && name.trim() !== '');
        const uniqueTeamNames = Array.from(new Set(teamNames));
        const translationMap = await translateTeamNames(uniqueTeamNames, env);

        // Group games by league
        const gamesByLeague = games.reduce((acc, game) => {
            const leagueName = game.league.name || 'Неизвестная лига';
            if (!acc[leagueName]) {
                acc[leagueName] = [];
            }
            acc[leagueName].push(game);
            return acc;
        }, {} as Record<string, SportGame[]>);

        const leagues = Object.keys(gamesByLeague);
        const totalPages = Math.ceil(leagues.length / LEAGUES_PER_PAGE);
        const currentPage = Math.max(0, Math.min(page, totalPages - 1));
        const start = currentPage * LEAGUES_PER_PAGE;
        const end = start + LEAGUES_PER_PAGE;
        const leaguesOnPage = leagues.slice(start, end);
        
        const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        let text = `*${sportLabel} на сегодня (${today})*\n\n`;

        leaguesOnPage.forEach(leagueName => {
            text += `*🏆 ${leagueName}*\n`;
            gamesByLeague[leagueName].forEach(game => {
                const gameTime = new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
                const statusEmoji = getMatchStatusEmoji(game.status);
                const homeTeam = translationMap[game.teams.home.name] || game.teams.home.name;
                const awayTeam = translationMap[game.teams.away.name] || game.teams.away.name;
                text += `${statusEmoji} *${gameTime}* - ${homeTeam} vs ${awayTeam}\n`;
            });
            text += '\n';
        });

        const navButtons = [];
        if (currentPage > 0) navButtons.push({ text: '⬅️ Пред.', callback_data: buildMatchCb(sport, ACTIONS.LIST, currentPage - 1) });
        if (currentPage < totalPages - 1) navButtons.push({ text: 'След. ➡️', callback_data: buildMatchCb(sport, ACTIONS.LIST, currentPage + 1) });

        const keyboard = makeKeyboard([
            navButtons,
            [
                { text: '🔄 Обновить', callback_data: buildMatchCb(sport, ACTIONS.LIST, currentPage) },
                { text: '◀️ К выбору спорта', callback_data: CB.MATCHES }
            ],
            [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
        ]);

        if(loadingMessageId) await editMessageText(chatId, loadingMessageId, text, env, keyboard);

    } catch (error) {
        console.error("Error in showMatchesList:", error);
        const userFriendlyError = error instanceof Error ? `🚫 ${error.message}` : `🚫 Произошла ошибка при загрузке матчей. Попробуйте позже.`;
        const keyboard = makeKeyboard([[{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]]);
        if (loadingMessageId) await editMessageText(chatId, loadingMessageId, userFriendlyError, env, keyboard);
    }
}