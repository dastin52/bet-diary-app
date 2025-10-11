import { Bet, BetStatus, BetType, Achievement } from '../types';

export const ACHIEVEMENTS: { [key: string]: Achievement } = {
    ROI_KING: { id: 'ROI_KING', name: 'Король ROI', description: 'Самый высокий ROI за период', icon: '👑' },
    LUCKY_HAND: { id: 'LUCKY_HAND', name: 'Удачливая рука', description: 'Самый крупный выигрыш с одной ставки', icon: '💰' },
    CRAZY_LOSS: { id: 'CRAZY_LOSS', name: 'Безумный проигрыш', description: 'Самый крупный проигрыш с одной ставки', icon: '💸' },
    MARATHON_RUNNER: { id: 'MARATHON_RUNNER', name: 'Марафонец', description: 'Наибольшее количество сделанных ставок', icon: '🏃‍♂️' },
    PARLAY_KING: { id: 'PARLAY_KING', name: 'Король экспрессов', description: 'Самый высокий выигранный коэффициент в экспрессе', icon: '🚂' },
};

export type UserAchievements = {
    [userId: string]: Achievement[];
};

interface ParticipantData {
    user: { email: string };
    bets: Bet[];
}

// Simplified ROI leaderboard type for this function's purpose
interface RoiParticipant {
    user: { email: string };
    stats: { roi: number };
}

export const calculateAchievements = (
    participantsData: ParticipantData[],
    roiLeaderboard: RoiParticipant[]
): UserAchievements => {
    const achievements: UserAchievements = {};
    if (participantsData.length === 0) return {};

    // Initialize
    participantsData.forEach(p => { achievements[p.user.email] = []; });
    
    // 1. ROI King
    if (roiLeaderboard.length > 0 && roiLeaderboard[0].stats.roi > 0) {
        achievements[roiLeaderboard[0].user.email]?.push(ACHIEVEMENTS.ROI_KING);
    }

    // 2. Other achievements
    let maxWin = { email: '', value: 0 };
    let maxLoss = { email: '', value: 0 };
    let maxBets = { email: '', value: 0 };
    let maxParlayOdds = { email: '', value: 0 };

    participantsData.forEach(p => {
        // Max bets
        if (p.bets.length > maxBets.value) {
            maxBets = { email: p.user.email, value: p.bets.length };
        }
        
        p.bets.forEach(bet => {
            // Max win
            if (bet.status === BetStatus.Won && (bet.profit ?? 0) > maxWin.value) {
                maxWin = { email: p.user.email, value: bet.profit! };
            }
            // Max loss
            if (bet.status === BetStatus.Lost && Math.abs(bet.profit ?? 0) > maxLoss.value) {
                maxLoss = { email: p.user.email, value: Math.abs(bet.profit!) };
            }
            // Max parlay odds
            if (bet.status === BetStatus.Won && bet.betType === BetType.Parlay && bet.odds > maxParlayOdds.value) {
                maxParlayOdds = { email: p.user.email, value: bet.odds };
            }
        });
    });

    if (maxWin.value > 0 && achievements[maxWin.email]) achievements[maxWin.email].push(ACHIEVEMENTS.LUCKY_HAND);
    if (maxLoss.value > 0 && achievements[maxLoss.email]) achievements[maxLoss.email].push(ACHIEVEMENTS.CRAZY_LOSS);
    if (maxBets.value > 0 && achievements[maxBets.email]) achievements[maxBets.email].push(ACHIEVEMENTS.MARATHON_RUNNER);
    if (maxParlayOdds.value > 0 && achievements[maxParlayOdds.email]) achievements[maxParlayOdds.email].push(ACHIEVEMENTS.PARLAY_KING);

    return achievements;
};