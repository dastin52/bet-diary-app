import React, { useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { useBetContext } from '../contexts/BetContext';
import { Bet, BetLeg, BetStatus, BetType } from '../types';

const ImportBetsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { addMultipleBets } = useBetContext();
    const [csvText, setCsvText] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleImport = () => {
        setError(null);
        if (!csvText.trim()) {
            setError("Поле для ввода пусто.");
            return;
        }

        const lines = csvText.trim().split('\n').slice(1); // Skip header
        const betsToImport: Omit<Bet, 'id' | 'createdAt' | 'event'>[] = [];
        let currentParlay: Omit<Bet, 'id' | 'createdAt' | 'event'> | null = null;

        try {
            for (const line of lines) {
                if (!line.trim()) continue; // Skip empty lines

                const values = line.split(',').map(s => s.trim());
                
                const isParlayLeg = !values[5] && values.slice(0,4).some(v => v); // betType is empty, but leg info exists

                if (isParlayLeg) {
                    if (!currentParlay || currentParlay.betType !== BetType.Parlay) {
                        throw new Error(`Строка события экспресса без основной ставки: ${line}`);
                    }
                    const [sport, homeTeam, awayTeam, market] = values;
                    if (!sport || !homeTeam || !awayTeam || !market) {
                         throw new Error(`Неполные данные для события экспресса: ${line}`);
                    }
                    currentParlay.legs.push({ homeTeam, awayTeam, market });
                } else {
                    if (currentParlay) {
                        betsToImport.push(currentParlay);
                        currentParlay = null;
                    }

                    const [sport, homeTeam, awayTeam, market, bookmaker, betType, stakeStr, oddsStr, status, tags] = values;
                    
                    if (!sport || !homeTeam || !awayTeam || !market || !betType || !stakeStr || !oddsStr || !status) {
                        throw new Error(`Некорректная строка: ${line}`);
                    }
                    
                    const newBet: Omit<Bet, 'id' | 'createdAt' | 'event'> = {
                        sport,
                        legs: [{ homeTeam, awayTeam, market }],
                        bookmaker: bookmaker || 'Другое',
                        betType: betType as BetType,
                        stake: parseFloat(stakeStr),
                        odds: parseFloat(oddsStr),
                        status: status as BetStatus,
                        tags: tags ? tags.split(';').map(t => t.trim()).filter(Boolean) : [],
                    };

                    if (newBet.betType === BetType.Parlay) {
                        currentParlay = newBet;
                    } else {
                        betsToImport.push(newBet);
                    }
                }
            }

            if (currentParlay) {
                betsToImport.push(currentParlay);
            }
            
            addMultipleBets(betsToImport);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Ошибка парсинга CSV.");
        }
    };

    return (
        <Modal title="Импорт ставок из CSV" onClose={onClose}>
            <div className="space-y-4">
                <div>
                    <h3 className="font-semibold">Инструкции</h3>
                    <p className="text-sm text-gray-400">Вставьте данные в формате CSV. Первая строка (заголовок) будет проигнорирована.</p>
                    <p className="text-xs font-mono bg-gray-700 p-2 rounded mt-2">sport,homeTeam,awayTeam,market,bookmaker,betType,stake,odds,status,tags</p>
                    <p className="text-sm text-gray-400 mt-2"><b>Для экспрессов:</b></p>
                    <ul className="list-disc list-inside text-sm text-gray-400">
                        <li>Первая строка события содержит все данные об экспрессе.</li>
                        <li>Каждая последующая строка для этого же экспресса должна содержать только первые 4 поля (sport, homeTeam, awayTeam, market). Остальные поля оставьте пустыми.</li>
                    </ul>
                    <p className="text-xs text-gray-500 mt-1">Теги разделяйте точкой с запятой (;)</p>
                </div>
                <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    rows={10}
                    className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white font-mono"
                    placeholder={`Футбол,Реал Мадрид,Барселона,П1,FONBET,single,100,2.15,won,класико;value_bet\nБаскетбол,Лейкерс,Клипперс,Тотал > 220.5,BetBoom,parlay,50,3.8,pending,nba_parlay\n,Теннис,Медведев,Рублев,П1,,,,,,`}
                />
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose}>Отмена</Button>
                    <Button onClick={handleImport}>Импортировать</Button>
                </div>
            </div>
        </Modal>
    );
};

export default ImportBetsModal;