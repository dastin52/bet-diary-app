// DEPRECATED: Прямые вызовы к Gemini API с фронтенда небезопасны.
// API-ключ будет виден всем пользователям.
// import { GoogleGenAI, Type } from "@google/genai";
import { Bet, BetLeg, Message, GroundingSource, BetStatus, UpcomingMatch } from '../types';
import { UseBetsReturn } from "../hooks/useBets";

// DEPRECATED: Инициализация на клиенте небезопасна.
// const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

// --- Системные инструкции остаются без изменений, они будут передаваться на бэкенд ---
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

// --- Вспомогательные функции остаются без изменений ---
function legsToText(legs: BetLeg[], sport: string): string {
    if (!legs || legs.length === 0) return "События не указаны.";
    
    if (legs.length === 1) {
        const leg = legs[0];
        const eventName = ['Теннис', 'Бокс', 'ММА'].includes(sport) 
            ? `${leg.homeTeam} - ${leg.awayTeam}` 
            : `${leg.homeTeam} vs ${leg.awayTeam}`;
        return `Событие: ${eventName}\n- Исход: ${leg.market}`;
    }

    const legsDescription = legs.map((leg, index) => {
        const eventName = ['Теннис', 'Бокс', 'ММА'].includes(sport) 
            ? `${leg.homeTeam} - ${leg.awayTeam}` 
            : `${leg.homeTeam} vs ${leg.awayTeam}`;
        return `  ${index + 1}. Событие: ${eventName}, Исход: ${leg.market}`;
    }).join('\n');
    return `Экспресс из ${legs.length} событий:\n${legsDescription}`;
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
 * НОВАЯ АРХИТЕКТУРА ДЛЯ ОНЛАЙН-РАЗВЕРТЫВАНИЯ
 * =====================================================================================
 * 
 * Все функции ниже теперь обращаются к вашему собственному бэкенд-серверу 
 * по адресу `/api/gemini`. Этот сервер должен:
 * 1. Принимать POST-запросы с телом, содержащим { endpoint: '...', payload: {...} }.
 * 2. Безопасно хранить `process.env.API_KEY` в переменных окружения сервера.
 * 3. Вызывать соответствующий метод Gemini API на основе `endpoint` и `payload`.
 * 4. Возвращать результат обратно на фронтенд.
 * 
 * Это предотвращает утечку вашего API-ключа.
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
        throw new Error(errorData.error || `Ошибка сервера при вызове ${endpoint}`);
    }

    return response.json();
}

export const fetchAIStrategy = async (analytics: UseBetsReturn['analytics']): Promise<string> => {
    const systemInstruction = `Вы — AI-Стратег...`; // Полный текст инструкции
    const prompt = `Проанализируй мою эффективность и дай стратегические советы.\n\n${analyticsToText(analytics)}`;
    
    try {
        const response = await callApiProxy('generateContent', {
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { systemInstruction },
        });
        return response.text;
    } catch (error) {
        console.error("Ошибка при запросе стратегии от AI:", error);
        throw new Error("Не удалось получить стратегический анализ от AI.");
    }
};

export const fetchUpcomingMatches = async (): Promise<UpcomingMatch[]> => {
     // Этот вызов требует сложной логики с JSON-схемой и инструментами,
     // которая должна быть реализована на бэкенде.
    try {
        const response = await callApiProxy('findMatches', {});
        if (response.events && Array.isArray(response.events)) {
            return response.events;
        }
        return [];
    } catch (error) {
        console.error("Ошибка при поиске событий:", error);
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
         console.error("Ошибка при анализе матча:", error);
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
             contents[0].parts[0].text = `${betToText(bet)}\n\n${contents[0].parts[0].text}`;
        }
    } else {
        const currentDate = new Date().toLocaleDateString('ru-RU', dateOptions);
        systemInstructionText = generalSystemInstruction(currentDate);
        if (contents.length > 0 && history.length === 1 && contents[0].role === 'user' && 
            (contents[0].parts[0].text.toLowerCase().includes('эффективность') || contents[0].parts[0].text.toLowerCase().includes('статистику'))) {
            contents[0].parts[0].text = `${analyticsToText(analytics)}\n\n${contents[0].parts[0].text}`;
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
        console.error("Ошибка при вызове AI API (text mode):", error);
        return { text: "К сожалению, произошла ошибка при обращении к AI-ассистенту. Пожалуйста, попробуйте позже.", sources: undefined };
    }
};
