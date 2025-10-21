// functions/api/matches.ts
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../telegram/matches';
import { Env, SportGame } from '../telegram/types';

interface EventContext {
    request: Request;
    env: Env;
}

const getMatchStatusEmoji = (status: { short: string } | undefined): string => {
    if (!status) return '⏳';

    switch (status.short) {
        case '1H': case 'HT': case '2H': case 'ET': case 'BT': case 'P': case 'LIVE': case 'INTR':
            return '🔴'; // Live
        case 'FT': case 'AET': case 'PEN': case 'POST': case 'CANC': case 'ABD': case 'AWD': case 'WO':
            return '🏁'; // Finished or Concluded
        case 'NS': case 'TBD':
        default:
            return '⏳'; // Scheduled
    }
};

export const onRequestGet = async ({ request, env }: EventContext): Promise<Response> => {
    try {
        const url = new URL(request.url);
        const sport = url.searchParams.get('sport');

        if (!sport) {
            return new Response(JSON.stringify({ error: 'Sport parameter is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 1. Fetch games from sports API (or cache/mock)
        const games = await getTodaysGamesBySport(sport, env);

        if (games.length === 0) {
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // 2. Translate team names
        const uniqueTeamNames = Array.from(new Set(games.flatMap(game => [game.teams.home.name, game.teams.away.name])));
        const translationMap = await translateTeamNames(uniqueTeamNames, env);
        
        // 3. Map games to a frontend-friendly format with translated names
        const translatedGames = games.map(game => ({
            sport: sport,
            eventName: game.league.name,
            teams: `${translationMap[game.teams.home.name] || game.teams.home.name} vs ${translationMap[game.teams.away.name] || game.teams.away.name}`,
            date: new Date(game.timestamp * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
            isHotMatch: false,
            status: {
                ...game.status,
                emoji: getMatchStatusEmoji(game.status),
            },
        }));

        return new Response(JSON.stringify(translatedGames), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, // Cache for 5 mins
        });

    } catch (error) {
        console.error('Error in /api/matches:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch matches.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};