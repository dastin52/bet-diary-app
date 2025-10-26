// src/utils/predictionUtils.ts

/**
 * Resolves the outcome of a bet market based on match scores and winner.
 * @param market The market string (e.g., "П1", "Тотал Больше 2.5").
 * @param scores The final scores of the match.
 * @param winner The overall winner, including overtime (for sports like hockey/basketball).
 * @returns 'correct', 'incorrect', or 'unknown'.
 */
export const resolveMarketOutcome = (market: string, scores: { home: number; away: number }, winner?: 'home' | 'away' | 'draw'): 'correct' | 'incorrect' | 'unknown' => {
    if (scores.home === null || scores.away === null) return 'unknown';
    
    const { home, away } = scores;
    const total = home + away;

    const marketClean = market.trim();

    // Handle main outcomes
    if (marketClean === 'П1' || marketClean === 'П1 (осн. время)') return home > away ? 'correct' : 'incorrect';
    if (marketClean === 'X' || marketClean === 'X (осн. время)') return home === away ? 'correct' : 'incorrect';
    if (marketClean === 'П2' || marketClean === 'П2 (осн. время)') return away > home ? 'correct' : 'incorrect';
    
    // Handle outcomes including Overtime
    if (marketClean.includes('П1 (с ОТ)') || marketClean.includes('П1 (вкл. ОТ')) return winner === 'home' ? 'correct' : 'incorrect';
    if (marketClean.includes('П2 (с ОТ)') || marketClean.includes('П2 (вкл. ОТ')) return winner === 'away' ? 'correct' : 'incorrect';

    // Handle double chance
    if (marketClean === '1X') return home >= away ? 'correct' : 'incorrect';
    if (marketClean === 'X2') return away >= home ? 'correct' : 'incorrect';
    if (marketClean === '12') return home !== away ? 'correct' : 'incorrect';

    // Handle Both Teams to Score
    if (marketClean === 'Обе забьют - Да') return home > 0 && away > 0 ? 'correct' : 'incorrect';
    if (marketClean === 'Обе забьют - Нет') return home === 0 || away === 0 ? 'correct' : 'incorrect';
    
    // Handle Totals (e.g., "Тотал Больше 2.5", "Тотал < 5.5")
    const totalMatch = marketClean.match(/(Тотал)\s(Больше|Меньше|>|<)\s?(\d+[\.,]?\d*)/i);
    if (totalMatch) {
        const type = totalMatch[2];
        const value = parseFloat(totalMatch[3].replace(',', '.'));
        if (isNaN(value)) return 'unknown';

        if (type === 'Больше' || type === '>') return total > value ? 'correct' : 'incorrect';
        if (type === 'Меньше' || type === '<') return total < value ? 'correct' : 'incorrect';
    }

    // Handle Handicaps (e.g., "Фора 1 (-1.5)")
    const handicapMatch = marketClean.match(/(Фора)\s(1|2)\s\(([-+])?(\d+[\.,]?\d*)\)/i);
    if (handicapMatch) {
        const team = handicapMatch[2];
        const sign = handicapMatch[3] === '-' ? -1 : 1;
        const value = parseFloat(handicapMatch[4].replace(',', '.')) * sign;
        if (isNaN(value)) return 'unknown';

        if (team === '1') return (home + value) > away ? 'correct' : 'incorrect';
        if (team === '2') return (away + value) > home ? 'correct' : 'incorrect';
    }

    return 'unknown';
};
