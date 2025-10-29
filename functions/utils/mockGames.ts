// functions/utils/mockGames.ts
import { SportGame } from '../telegram/types';

export function generateMockGames(sport: string): SportGame[] {
    console.log(`[MOCK] Generating mock games for ${sport}`);
    const today = new Date().toISOString().split('T')[0];
    // Use a fixed timestamp for consistent mock data
    const baseTimestamp = Math.floor(new Date(`${today}T18:00:00Z`).getTime() / 1000);

    const mocks: { [key: string]: any[] } = {
        football: [
            { id: 1001, fixture: { id: 1001, date: `${today}T19:00:00Z`, timestamp: baseTimestamp + 3600, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' } }, league: { id: 39, name: 'Premier League', country: 'England', logo: '', season: 2023 }, teams: { home: { id: 40, name: 'Manchester City', winner: null }, away: { id: 42, name: 'Liverpool', winner: null } }, score: { fulltime: { home: null, away: null } } },
            { id: 1002, fixture: { id: 1002, date: `${today}T16:00:00Z`, timestamp: baseTimestamp - 7200, timezone: 'UTC', status: { long: 'Match Finished', short: 'FT' } }, league: { id: 140, name: 'La Liga', country: 'Spain', logo: '', season: 2023 }, teams: { home: { id: 529, name: 'Real Madrid', winner: true }, away: { id: 530, name: 'Barcelona', winner: false } }, score: { fulltime: { home: 2, away: 1 } } },
        ],
        hockey: [
            { id: 2001, date: `${today}T18:30:00Z`, time: '18:30', timestamp: baseTimestamp + 1800, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 23, name: 'KHL', country: 'Russia', logo: '', season: 2023 }, teams: { home: { id: 198, name: 'CSKA Moscow' }, away: { id: 199, name: 'SKA St. Petersburg' } }, scores: { home: null, away: null } },
        ],
        basketball: [
            { id: 3001, date: `${today}T20:00:00Z`, time: '20:00', timestamp: baseTimestamp + 7200, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 106, name: 'VTB United League', country: 'Russia', logo: '', season: 2023 }, teams: { home: { id: 204, name: 'Anadolu Efes' }, away: { id: 205, name: 'Real Madrid' } }, scores: { home: null, away: null } },
        ],
        nba: [
             { id: 4001, date: `${today}T21:00:00Z`, time: '21:00', timestamp: baseTimestamp + 10800, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 12, name: 'NBA', country: 'USA', logo: '', season: 2023 }, teams: { home: { id: 15, name: 'Los Angeles Lakers' }, away: { id: 16, name: 'Los Angeles Clippers' } }, scores: { home: null, away: null } },
        ]
    };

    const sportMocks = mocks[sport] || [];

    return (sportMocks).map((item: any): SportGame => {
        if (sport === 'football') {
             return {
                id: item.fixture.id,
                date: item.fixture.date.split('T')[0],
                time: new Date(item.fixture.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                timestamp: item.fixture.timestamp,
                timezone: item.fixture.timezone,
                status: item.fixture.status,
                league: item.league,
                teams: item.teams,
                scores: item.score.fulltime,
                winner: item.fixture.status.short === 'FT' ? (item.teams.home.winner ? 'home' : (item.teams.away.winner ? 'away' : 'draw')) : undefined,
            };
        }
        // For hockey and basketball, map explicitly to ensure correct structure
        return {
            id: item.id,
            date: item.date.split('T')[0],
            time: item.time,
            timestamp: item.timestamp,
            timezone: item.timezone,
            status: { long: item.status.long, short: item.status.short },
            league: item.league,
            teams: item.teams,
            scores: item.scores,
            winner: (item.scores?.home !== null && item.scores?.away !== null && item.scores.home !== undefined && item.scores.away !== undefined)
                ? (item.scores.home > item.scores.away ? 'home' : (item.scores.away > item.scores.home ? 'away' : 'draw'))
                : undefined,
        };
    });
}
