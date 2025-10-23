import { Bet, BetLeg, Message, GroundingSource, BetStatus, UpcomingMatch } from '../types';
import { UseBetsReturn } from "../hooks/useBets";

const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

const betSystemInstruction = `Вы — эксперт-аналитик по спортивным ставкам. Ваша цель — предоставлять проницательные, сбалансированные и ответственные советы. Анализируйте ставку пользователя на основе предоставленных данных. Вы также можете использовать поиск в реальном времени для получения дополнительной информации о матче, если пользователь спросит. Не давайте финансовых советов и не гарантируйте исход. Обсуждайте вероятности, потенциальные риски и стратегии. Сохраняйте тон полезного и аналитического помощника. Отвечайте на русском языке.`;

const generalSystemInstruction = (currentDate: string) => `Вы — эксперт-аналитик по спортивным ставкам. Сегодняшняя дата: ${currentDate}. Всегда используй эту дату как точку отсчета для любых запросов о текущих или будущих событиях.

Ваша цель — анализировать производительность пользователя или давать прогнозы на матчи.

1.  **Анализ производительности:** Если пользователь просит проанализировать его эффективность, используйте предоставленные сводные данные и дайте высокоуровневые советы по стратегии.
2.  **Прогноз на матч:**
    - Когда вас просят проанализировать предстоящий или текущий матч, используйте поиск в реальном времени. Найди ближайший по дате матч, соответствующий запросу.
    - Проводите глубокий анализ: статистика, форма, история встреч, новости.
    - Предоставьте краткий, но содержательный обзор.
    - **В завершение ОБЯЗАТЕЛЬНО дайте прогноз проходимости на основные исходы (П1, X, П2) в виде процентов, например: "Прогноз проходимости: П1 - 45%, X - 30%, П2 - 25%". Не предлагай процент от банка для ставки.**

Всегда поощряйте ответственную игру. Не давайте прямых финансовых советов. Отвечайте на русском языке.`;

const predictionAnalysisSystemInstruction = `Вы — ML-инженер, специализирующийся на моделях для прогнозирования спортивных событий. Вам предоставили статистику производительности текущей модели прогнозов AI.

Ваша задача:
1.  **Проанализировать сильные и слабые стороны модели** на основе предоставленных данных (общая точность, точность по видам спорта, по типам исходов).
2.  **Дать конкретные рекомендации пользователю**, как использовать эту модель. Например: "Модель показывает хорошую точность в футболе на исход 'Тотал Больше 2.5', этим прогнозам можно доверять больше. Однако, она часто ошибается в прогнозах на ничью (X), поэтому такие ставки лучше пропускать или анализировать дополнительно".
3.  **Предложить гипотезы для улучшения модели**. Например: "Для улучшения прогнозов на хоккей, модели стоит уделить больше внимания статистике последних 5 игр, а не всему сезону".

Ответ должен быть структурированным, ясным и полезным для конечного пользователя, который хочет понять, каким прогнозам AI стоит доверять. Отвечайте на русском языке.`;


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

export const fetchAIPredictionAnalysis = async (analyticsText: string): Promise<string> => {
    const prompt = `Вот статистика производительности нашей модели. Проанализируй её и дай рекомендации.\n\n${analyticsText}`;
    try {
        const response = await callApiProxy('generateContent', {
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: { systemInstruction: predictionAnalysisSystemInstruction },
        });
        return response.text;
    } catch (error) {
        console.error("Ошибка при запросе анализа прогнозов AI:", error);
        throw new Error("Не удалось получить анализ прогнозов от AI.");
    }
};


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
        // Inject analytics only if it's the first message and it's about performance
        const firstUserMessage = contents.find(c => c.role === 'user');
        if (history.filter(m => m.role === 'user').length === 1 && firstUserMessage &&
            (firstUserMessage.parts[0].text.toLowerCase().includes('эффективность') || firstUserMessage.parts[0].text.toLowerCase().includes('статистику'))) {
            firstUserMessage.parts[0].text = `${analyticsToText(analytics)}\n\n${firstUserMessage.parts[0].text}`;
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