import { SharedPrediction, AIPrediction, AIPredictionStatus } from '../types';

const getMockStatus = (time: string): { status: { long: string, short: string, emoji: string }, score?: string } => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    // Создаем дату матча в UTC для корректного сравнения
    const gameDate = new Date(`${todayStr}T${time}:00.000Z`);
    // Считаем минуты с начала матча относительно текущего времени
    const minutesSinceStart = (now.getTime() - gameDate.getTime()) / 60000;

    if (minutesSinceStart > 120) {
        return { status: { long: 'Finished', short: 'FT', emoji: '🏁' }, score: '2 - 1' };
    }
    if (minutesSinceStart > 0) {
        return { status: { long: 'Live', short: 'LIVE', emoji: '🔴' }, score: '1 - 1' };
    }
    return { status: { long: 'Not Started', short: 'NS', emoji: '⏳' } };
};

const createMockPrediction = (gameId: number, sport: string, matchName: string): AIPrediction => {
    const probabilities = { 'П1': 45, 'X': 25, 'П2': 30, 'Тотал Больше 2.5': 60 };
    const coefficients = { 'П1': 2.1, 'X': 3.4, 'П2': 2.9, 'Тотал Больше 2.5': 1.85 };
    return {
        id: `mock-pred-${gameId}`,
        createdAt: new Date().toISOString(),
        sport,
        matchName,
        prediction: JSON.stringify({
            probabilities,
            coefficients,
            recommended_outcome: 'П1'
        }),
        status: AIPredictionStatus.Pending,
    };
};

const createMockMatch = (id: number, sport: string, eventName: string, home: string, away: string, time: string): SharedPrediction => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const gameDate = new Date(`${todayStr}T${time}:00.000Z`);
    const { status, score } = getMockStatus(time);
    const matchName = `${home} vs ${away}`;

    return {
        id,
        sport,
        eventName,
        teams: matchName,
        date: gameDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric'}),
        time: gameDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
        timestamp: Math.floor(gameDate.getTime() / 1000),
        status,
        score,
        isHotMatch: Math.random() > 0.7,
        prediction: sport !== 'nba' ? createMockPrediction(id, sport, matchName) : null,
    };
};

export const generateClientSideMocks = (): SharedPrediction[] => {
    const football = [
        createMockMatch(201, 'football', 'La Liga', 'Реал Мадрид', 'Барселона', '19:00'),
        createMockMatch(202, 'football', 'Premier League', 'Манчестер Сити', 'Ливерпуль', '15:30'),
    ];
    const hockey = [
        createMockMatch(101, 'hockey', 'КХЛ', 'ЦСКА', 'СКА', '16:30'),
        createMockMatch(102, 'hockey', 'NHL', 'Торонто', 'Бостон', '23:00'),
    ];
    const basketball = [
        createMockMatch(301, 'basketball', 'Euroleague', 'Анадолу Эфес', 'Реал Мадрид', '18:45'),
    ];
    const nba = [
        createMockMatch(401, 'nba', 'NBA', 'Лейкерс', 'Бостон Селтикс', '23:30'),
    ];
    
    return [...football, ...hockey, ...basketball, ...nba];
};
