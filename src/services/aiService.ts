
import { Bet, BetLeg, Message, GroundingSource, UpcomingMatch } from '../types';
import { UseBetsReturn } from "../hooks/useBets";

const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

// --- System instructions will be sent to the backend ---
const betSystemInstruction = `Вы — эксперт-аналитик по спортивным ставкам. Ваша цель — предоставлять проницательные, сбалансированные и ответственные советы. Анализируйте ставку пользователя на основе предоставленных данных. Вы также можете использовать поиск в реальном времени для получения дополнительной информации о матче, если пользователь спросит. Не давайте финансовых советов и не гарантируйте исход. Обсуждайте вероятности, потенциальные риски и стратегии. Сохраняйте тон полезного и аналитического помощника. Отвечайте на русском языке.`;
const generalSystemInstruction = (currentDate: string) => `Вы — эксперт-аналитик по спортивным ставкам. Сегодняшняя дата: ${currentDate}. Всегда используй эту дату как точку отсчета для любых запросов о текущих или будущих событиях.

Ваша цель — анализировать производительность пользователя или давать прогнозы на матчи.

1.  **Анализ производительности:** Если пользователь просит проанализировать его эффективность, используйте предоставленные сводные данные и дайте высокоуровневые советы по стратегии.
2.  **Прогноз на матч:**
    - Когда вас просят проанализировать предстоящий или текущий матч, используйте поиск в реальном времени. Будьте внимательны к датам, ориентируясь на ${currentDate} как на "сегодня".
    - Проводите глубокий анализ: статистика, форма, история встреч, новости.
    - Предоставьте краткий, но содержательный обзор.
    - **В завершение ОБЯЗАТЕЛЬНО дайте прогноз в процентном соотношении на основные исходы** (например, П1, X, П2) и порекомендуйте наиболее вероятный исход.

Всегда поощряйте ответственную игру. Не давайте прямых финансовых советов. Отвечайте на русском языке.`;

// --- Helper functions remain unchanged ---
function legsToText(legs: BetLeg[], sport: string): string {
    if (!legs || legs.length === 0) return "События не указаны.";
    
    if (legs.length === 1) {
        const leg = legs[0];
        const eventName = ['Теннис', 'Бокс', 'ММА'].includes(sport) 
            ? `${leg.homeTeam} - ${leg.awayTeam}` 
            : `${leg.homeTeam} vs ${leg.awayTeam}`;
        return `Событие: ${eventName}\\n- Исход: ${leg.market}`;
    }

    const legsDescription = legs.map((leg, index) => {
        const eventName = ['Теннис', 'Бокс', 'ММА'].includes(sport) 
            ? `${leg.homeTeam} - ${leg.awayTeam}` 
            : `${leg.homeTeam} vs ${leg.awayTeam}`;
        return `  ${index + 1}. Событие: ${eventName}, Исход: ${leg.market}`;
    }).join('\\n');
    return `Экспресс из ${legs.length} событий:\\n${legsDescription}`;
}
function betToText(bet: Bet): string {
    return `
Вот данные по ставке для анализа:
- Спорт: ${bet.sport}
- ${legsToText(bet.legs, bet.sport)}
- Тип ставки: ${bet.betType}
- Сумма: ${bet.stake}
- Коэффициент: ${bet.odds}
- Статус: ${bet.status}
    `;
}
function analyticsToText(analytics: UseBetsReturn['analytics']): string {
    return `
Вот сводные данные по ставкам пользователя для анализа:
- Общая прибыль: ${analytics.totalProfit.toFixed(2)}
- ROI: ${analytics.roi.toFixed(2)}%
- Количество ставок: ${analytics.betCount}
- Процент выигрышей: ${analytics.winRate.toFixed(2)}%
- Прибыль по видам спорта: ${JSON.stringify(analytics.profitBySport.map(p => `${p.sport}: ${p.profit.toFixed(2)}`))}
- Прибыль по типам ставок: ${JSON.stringify(analytics.profitByBetType.map(p => `${p.type}: ${p.profit.toFixed(2)}`))}
    `;
}

/**
 * =====================================================================================
 * SECURE API ARCHITECTURE FOR PRODUCTION
 * =====================================================================================
 * 
 * All functions below now call our own backend server function 
 * at `/api/gemini`. This server function will:
 * 1. Accept POST requests with a body containing { endpoint: '...', payload: {...} }.
 * 2. Securely store `process.env.GEMINI_API_KEY` in the server's environment variables.
 * 3. Call the appropriate Gemini API method based on `endpoint` and `payload`.
 * 4. Return the result to the frontend.
 * 
 * This prevents your API key from ever being exposed to the user's browser.
 */
async function callApiProxy(endpoint: string, payload: object) {
    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint, payload }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error when calling ${endpoint}`);
    }

    return response.json();
}

export const fetchAIStrategy = async (analytics: UseBetsReturn['analytics']): Promise<string> => {
    const systemInstruction = `Вы — AI-Стратег...`; // Full instruction text
    const prompt = `Проанализируй мою эффективность и дай стратегические советы.\\n\\n${analyticsToText(analytics)}`;
    
    try {
        const response = await callApiProxy('generateContent', {
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { systemInstruction },
        });
        return response.text;
    } catch (error) {
        console.error("Error fetching AI strategy:", error);
        throw new Error("Не удалось получить стратегический анализ от AI.");
    }
};

export const fetchUpcomingMatches = async (): Promise<UpcomingMatch[]> => {
    try {
        const response = await callApiProxy('findMatches', {});
        if (response.events && Array.isArray(response.events)) {
            return response.events;
        }
        return [];
    } catch (error) {
        console.error("Error fetching upcoming matches:", error);
        throw new Error("Не удалось получить список матчей от AI.");
    }
}

export const fetchMatchAnalysis = async (match: UpcomingMatch): Promise<{ text: string; sources: GroundingSource[] | undefined }> => {
    const currentDate = new Date().toLocaleDateString('ru-RU', dateOptions);
    const prompt = `Сделай детальный анализ предстоящего матча: ${match.teams} (${match.sport}, ${match.eventName}) который состоится ${match.date}. Включи последние новости, статистику команд, историю встреч и форму. В конце дай свой прогноз на исход.`;
    
    try {
        const response = await callApiProxy('generateContent', {
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: generalSystemInstruction(currentDate),
            },
            tools: [{googleSearch: {}}],
        });
        return { text: response.text, sources: response.sources };
    } catch (error) {
         console.error("Error fetching match analysis:", error);
         throw new Error("Не удалось получить анализ матча от AI.");
    }
}


export const getAIChatResponse = async (
    bet: Bet | null,
    history: Message[],
    analytics: UseBetsReturn['analytics']
): Promise<{ text: string; sources: GroundingSource[] | undefined }> => {
    const contents = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }],
    }));
    
    let systemInstructionText: string;
    
    if (bet) {
        systemInstructionText = betSystemInstruction;
        if (contents.length > 0 && history.length === 1 && contents[0].role === 'user') {
             contents[0].parts[0].text = `${betToText(bet)}\\n\\n${contents[0].parts[0].text}`;
        }
    } else {
        const currentDate = new Date().toLocaleDateString('ru-RU', dateOptions);
        systemInstructionText = generalSystemInstruction(currentDate);
        if (contents.length > 0 && history.length === 1 && contents[0].role === 'user' && 
            (contents[0].parts[0].text.toLowerCase().includes('эффективность') || contents[0].parts[0].text.toLowerCase().includes('статистику'))) {
            contents[0].parts[0].text = `${analyticsToText(analytics)}\\n\\n${contents[0].parts[0].text}`;
        }
    }

    try {
        const response = await callApiProxy('generateContent', {
            model: "gemini-2.5-flash",
            contents: contents,
            config: {
                systemInstruction: systemInstructionText,
            },
            tools: [{googleSearch: {}}],
        });

        return { text: response.text, sources: response.sources };
    } catch (error) {
        console.error("Error calling AI API (text mode):", error);
        return { text: "К сожалению, произошла ошибка при обращении к AI-ассистенту. Пожалуйста, попробуйте позже.", sources: undefined };
    }
};
