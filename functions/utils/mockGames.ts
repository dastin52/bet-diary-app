// functions/utils/mockGames.ts
import { SportGame } from '../telegram/types';

export function generateMockGames(sport: string): SportGame[] {
    console.log(`[MOCK] Generating dynamic mock games for ${sport}`);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const nowSec = Math.floor(now.getTime() / 1000);

    const mocks: { [key: string]: any[] } = {
        football: [
            { id: 9001, fixture: { id: 9001, date: new Date((nowSec + 7200) * 1000).toISOString(), timestamp: nowSec + 7200, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' } }, league: { id: 39, name: 'Premier League', country: 'England', logo: '', season: 2026 }, teams: { home: { id: 40, name: 'Manchester City', winner: null }, away: { id: 42, name: 'Liverpool', winner: null } }, score: { fulltime: { home: null, away: null } } },
            { id: 9002, fixture: { id: 9002, date: new Date((nowSec + 14400) * 1000).toISOString(), timestamp: nowSec + 14400, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' } }, league: { id: 140, name: 'La Liga', country: 'Spain', logo: '', season: 2026 }, teams: { home: { id: 529, name: 'Real Madrid', winner: null }, away: { id: 530, name: 'Barcelona', winner: null } }, score: { fulltime: { home: null, away: null } } },
            { id: 9003, fixture: { id: 9003, date: new Date((nowSec + 21600) * 1000).toISOString(), timestamp: nowSec + 21600, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' } }, league: { id: 135, name: 'Serie A', country: 'Italy', logo: '', season: 2026 }, teams: { home: { id: 496, name: 'Juventus', winner: null }, away: { id: 505, name: 'Inter Milan', winner: null } }, score: { fulltime: { home: null, away: null } } },
            { id: 9004, fixture: { id: 9004, date: new Date((nowSec + 28800) * 1000).toISOString(), timestamp: nowSec + 28800, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' } }, league: { id: 78, name: 'Bundesliga', country: 'Germany', logo: '', season: 2026 }, teams: { home: { id: 157, name: 'Bayern Munich', winner: null }, away: { id: 165, name: 'Borussia Dortmund', winner: null } }, score: { fulltime: { home: null, away: null } } },
        ],
        hockey: [
            { id: 9011, date: new Date((nowSec + 3600) * 1000).toISOString(), time: '18:30', timestamp: nowSec + 3600, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 23, name: 'KHL', country: 'Russia', logo: '', season: 2026 }, teams: { home: { id: 198, name: 'CSKA Moscow' }, away: { id: 199, name: 'SKA St. Petersburg' } }, scores: { home: null, away: null } },
            { id: 9012, date: new Date((nowSec + 10800) * 1000).toISOString(), time: '20:30', timestamp: nowSec + 10800, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 57, name: 'NHL', country: 'USA', logo: '', season: 2026 }, teams: { home: { id: 1, name: 'Tampa Bay Lightning' }, away: { id: 2, name: 'Colorado Avalanche' } }, scores: { home: null, away: null } },
        ],
        basketball: [
            { id: 9021, date: new Date((nowSec + 7200) * 1000).toISOString(), time: '20:00', timestamp: nowSec + 7200, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 106, name: 'EuroLeague', country: 'Europe', logo: '', season: 2026 }, teams: { home: { id: 204, name: 'Anadolu Efes' }, away: { id: 205, name: 'Real Madrid' } }, scores: { home: null, away: null } },
            { id: 9022, date: new Date((nowSec + 18000) * 1000).toISOString(), time: '23:00', timestamp: nowSec + 18000, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 106, name: 'VTB United League', country: 'Russia', logo: '', season: 2026 }, teams: { home: { id: 210, name: 'CSKA Moscow' }, away: { id: 211, name: 'Zenit St. Petersburg' } }, scores: { home: null, away: null } },
        ],
        nba: [
            { id: 9031, date: new Date((nowSec + 14400) * 1000).toISOString(), time: '22:00', timestamp: nowSec + 14400, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 12, name: 'NBA', country: 'USA', logo: '', season: 2026 }, teams: { home: { id: 15, name: 'Los Angeles Lakers' }, away: { id: 16, name: 'Golden State Warriors' } }, scores: { home: null, away: null } },
            { id: 9032, date: new Date((nowSec + 25200) * 1000).toISOString(), time: '01:00', timestamp: nowSec + 25200, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 12, name: 'NBA', country: 'USA', logo: '', season: 2026 }, teams: { home: { id: 17, name: 'Boston Celtics' }, away: { id: 18, name: 'Milwaukee Bucks' } }, scores: { home: null, away: null } },
        ],
        tennis: [
            { id: 9041, date: new Date((nowSec + 5400) * 1000).toISOString(), time: '15:00', timestamp: nowSec + 5400, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 1, name: 'ATP Masters 1000', country: 'International', logo: '', season: 2026 }, teams: { home: { id: 101, name: 'Carlos Alcaraz' }, away: { id: 102, name: 'Jannik Sinner' } }, scores: { home: null, away: null } },
        ],
        mma: [
            { id: 9051, date: new Date((nowSec + 28800) * 1000).toISOString(), time: '04:00', timestamp: nowSec + 28800, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 1, name: 'UFC 305', country: 'USA', logo: '', season: 2026 }, teams: { home: { id: 201, name: 'Islam Makhachev' }, away: { id: 202, name: 'Arman Tsarukyan' } }, scores: { home: null, away: null } },
        ],
    };

    const sportMocks = mocks[sport] || [
        { id: 9991, date: new Date((nowSec + 7200) * 1000).toISOString(), time: '20:00', timestamp: nowSec + 7200, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 99, name: `${sport.toUpperCase()} Championship`, country: 'World', logo: '', season: 2026 }, teams: { home: { id: 901, name: 'Team Alpha' }, away: { id: 902, name: 'Team Beta' } }, scores: { home: null, away: null } }
    ];

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

