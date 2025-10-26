import React, { useState, useEffect, useCallback } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>;
const ExclamationCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
const WarningIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 3.011-1.742 3.011H4.42c-1.53 0-2.493-1.677-1.743-3.011l5.58-9.92zM10 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
const Spinner = () => <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400"></div>;

type Status = 'pending' | 'success' | 'warning' | 'error';
interface CheckResult {
    status: Status;
    message: string;
}
interface CacheCheckResult extends CheckResult {
    count?: number;
    latest?: string;
    isStale?: boolean;
}

const SPORTS_TO_CHECK = ['football', 'hockey', 'basketball', 'nba', 'all'];

const DiagnosticsPanel: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [log, setLog] = useState('');
    const [connectivity, setConnectivity] = useState<CheckResult | null>(null);
    const [apiKeys, setApiKeys] = useState<CheckResult | null>(null);
    const [lastUpdate, setLastUpdate] = useState<CheckResult | null>(null);
    const [lastError, setLastError] = useState<CheckResult | null>(null);
    const [cacheStatus, setCacheStatus] = useState<Record<string, CacheCheckResult>>({});
    const [copySuccess, setCopySuccess] = useState(false);

    const runDiagnostics = useCallback(async () => {
        setIsLoading(true);
        setConnectivity(null);
        setApiKeys(null);
        setLastUpdate(null);
        setLastError(null);
        setCacheStatus({});
        let fullLog = `--- DIAGNOSTICS LOG @ ${new Date().toISOString()} ---\n\n`;

        // 1. Connectivity, API Keys & Last Update Time
        setConnectivity({ status: 'pending', message: 'Проверка связи с бэкендом...' });
        try {
            const healthRes = await fetch('/api/health');
            if (!healthRes.ok) throw new Error(`Server returned status ${healthRes.status}`);
            const healthData = await healthRes.json();
            
            // Connectivity
            const connSuccessMsg = `Успешное соединение с бэкендом. (${healthData.timestamp})`;
            setConnectivity({ status: 'success', message: connSuccessMsg });
            fullLog += `[SUCCESS] Connectivity: ${connSuccessMsg}\n`;

            // API Keys
            const geminiOk = healthData.apiKeys?.gemini === 'CONFIGURED';
            const keysOk = geminiOk;
            let apiKeyMessage = `Gemini: ${healthData.apiKeys?.gemini}, Sports API: ${healthData.apiKeys?.sportsApi}`;
            setApiKeys({ status: keysOk ? 'success' : 'error', message: apiKeyMessage });
            fullLog += `[${keysOk ? 'SUCCESS' : 'ERROR'}] API Keys: ${apiKeyMessage}\n`;

            // Last Update Error
            const errorData = healthData.lastUpdateError;
            if (errorData) {
                const errorMsg = `Последний запуск обновления завершился ошибкой в ${new Date(errorData.timestamp).toLocaleString('ru-RU')}.
Причина: ${errorData.message}`;
                setLastError({ status: 'error', message: errorMsg });
                fullLog += `\n--- LAST UPDATE ERROR ---\n[ERROR] ${errorMsg}\n`;
                if (errorData.stack) {
                    fullLog += `Stack Trace: ${errorData.stack}\n`;
                }
            } else {
                setLastError(null);
            }

            // Last Update
            const lastRunTimestamp = healthData.lastSuccessfulUpdate;
            let lastUpdateStatus: Status = 'error';
            let lastUpdateMessage = 'Информация о последнем запуске фонового обновления отсутствует.';
            if (lastRunTimestamp && lastRunTimestamp !== 'Not run yet') {
                const lastRunDate = new Date(lastRunTimestamp);
                const hoursAgo = (new Date().getTime() - lastRunDate.getTime()) / (1000 * 60 * 60);
                if (hoursAgo > 3) {
                    lastUpdateStatus = 'warning';
                    lastUpdateMessage = `Последнее обновление было ${lastRunDate.toLocaleString('ru-RU')} (${hoursAgo.toFixed(1)} ч. назад). Данные могут быть неактуальными.`;
                } else {
                    lastUpdateStatus = 'success';
                    lastUpdateMessage = `Последнее успешное обновление: ${lastRunDate.toLocaleString('ru-RU')}`;
                }
            }
            setLastUpdate({ status: lastUpdateStatus, message: lastUpdateMessage });
            fullLog += `[${lastUpdateStatus.toUpperCase()}] Last Update Check: ${lastUpdateMessage}\n`;

        } catch (e) {
            const errorMsg = `Не удалось подключиться к бэкенду. Убедитесь, что сервер запущен. Ошибка: ${e instanceof Error ? e.message : String(e)}`;
            setConnectivity({ status: 'error', message: errorMsg });
            setApiKeys({ status: 'error', message: 'Проверка невозможна из-за ошибки подключения.' });
            setLastUpdate({ status: 'error', message: 'Проверка невозможна.' });
            fullLog += `[ERROR] Connectivity: ${errorMsg}\n`;
            setIsLoading(false);
            setLog(fullLog);
            return;
        }
        fullLog += '\n--- CACHE STATUS ---\n';

        // 2. Cache Status
        for (const sport of SPORTS_TO_CHECK) {
            setCacheStatus(prev => ({ ...prev, [sport]: { status: 'pending', message: `Проверка кэша для '${sport}'...` } }));
            try {
                const endpoint = sport === 'all' ? 'getAllPredictions' : 'getMatchesWithPredictions';
                const payload = sport === 'all' ? {} : { sport };

                const cacheRes = await fetch('/api/gemini', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint, payload }),
                });

                if (!cacheRes.ok) throw new Error(`Server returned status ${cacheRes.status}`);
                const data = await cacheRes.json();
                
                if (!Array.isArray(data)) throw new Error('Response is not an array.');

                const latestTimestamp = data.length > 0 ? Math.max(...data.map(p => p.timestamp || 0)) : 0;
                const latestDate = latestTimestamp > 0 ? new Date(latestTimestamp * 1000).toLocaleString('ru-RU') : 'N/A';
                const todayStr = new Date().toISOString().split('T')[0];
                const isDataStale = latestTimestamp > 0 && !new Date(latestTimestamp * 1000).toISOString().startsWith(todayStr);

                let status: Status = data.length > 0 ? 'success' : 'warning';
                let finalMessage = data.length > 0 ? `Найдено ${data.length} записей.` : `Кэш пуст или устарел.`;

                if (isDataStale) {
                    status = 'warning';
                    finalMessage += ` Данные устарели (от ${new Date(latestTimestamp * 1000).toLocaleDateString('ru-RU')}).`;
                }

                setCacheStatus(prev => ({ ...prev, [sport]: { status, message: finalMessage, count: data.length, latest: latestDate, isStale: isDataStale } }));
                fullLog += `[${status.toUpperCase()}] Cache '${sport}': ${finalMessage} Latest: ${latestDate}\n`;

            } catch (e) {
                const errorMsg = `Ошибка при проверке кэша '${sport}'. ${e instanceof Error ? e.message : String(e)}`;
                setCacheStatus(prev => ({ ...prev, [sport]: { status: 'error', message: errorMsg } }));
                fullLog += `[ERROR] Cache '${sport}': ${errorMsg}\n`;
            }
        }

        setIsLoading(false);
        setLog(fullLog);
    }, []);

    useEffect(() => {
        runDiagnostics();
    }, [runDiagnostics]);

    const handleCopyLog = () => {
        navigator.clipboard.writeText(log);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const StatusIcon = ({ status }: { status: Status }) => {
        if (status === 'pending') return <Spinner />;
        if (status === 'success') return <CheckCircleIcon />;
        if (status === 'warning') return <WarningIcon />;
        return <ExclamationCircleIcon />;
    };

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Системная Диагностика</h2>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={runDiagnostics} disabled={isLoading}>Перезапустить</Button>
                        <Button onClick={handleCopyLog}>{copySuccess ? 'Скопировано!' : 'Копировать лог'}</Button>
                    </div>
                </div>
                <p className="text-sm text-gray-400 mt-2">
                    Эта панель проверяет ключевые компоненты системы для выявления проблем. Если матчи не отображаются,
                    скопируйте лог и отправьте его для анализа.
                </p>
            </Card>

            {lastError && (
                <Card className="!bg-red-900/50 border-red-700">
                    <div className="flex items-start gap-3">
                        <ExclamationCircleIcon />
                        <div>
                            <h3 className="text-lg font-semibold text-red-300">Критическая ошибка обновления</h3>
                            <p className="text-sm text-red-200 whitespace-pre-wrap">{lastError.message}</p>
                        </div>
                    </div>
                </Card>
            )}

            <Card>
                <h3 className="text-lg font-semibold mb-4">Результаты Проверки</h3>
                <div className="space-y-4">
                   <div className="flex items-start gap-3 p-2 rounded-lg bg-gray-900/30">
                        {connectivity && <StatusIcon status={connectivity.status} />}
                        <div>
                            <p className="font-semibold">Связь с бэкендом</p>
                            <p className="text-sm text-gray-400">{connectivity?.message || 'Ожидание...'}</p>
                        </div>
                    </div>
                     <div className="flex items-start gap-3 p-2 rounded-lg bg-gray-900/30">
                        {apiKeys && <StatusIcon status={apiKeys.status} />}
                        <div>
                            <p className="font-semibold">Конфигурация API ключей на бэкенде</p>
                            <p className="text-sm text-gray-400">{apiKeys?.message || 'Ожидание...'}</p>
                        </div>
                    </div>
                     <div className="flex items-start gap-3 p-2 rounded-lg bg-gray-900/30">
                        {lastUpdate && <StatusIcon status={lastUpdate.status} />}
                        <div>
                            <p className="font-semibold">Последнее фоновое обновление</p>
                            <p className="text-sm text-gray-400">{lastUpdate?.message || 'Ожидание...'}</p>
                        </div>
                    </div>
                    {SPORTS_TO_CHECK.map(sport => (
                        <div key={sport} className="flex items-start gap-3 p-2 rounded-lg bg-gray-900/30">
                            {cacheStatus[sport] && <StatusIcon status={cacheStatus[sport].status} />}
                            <div>
                                <p className="font-semibold">Кэш прогнозов: {sport}</p>
                                <p className="text-sm text-gray-400">{cacheStatus[sport]?.message || 'Ожидание...'}</p>
                                {cacheStatus[sport]?.count !== undefined && (
                                    <p className="text-xs text-gray-500">Записей: {cacheStatus[sport]?.count}, Последнее обновление: {cacheStatus[sport]?.latest}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};
export default DiagnosticsPanel;