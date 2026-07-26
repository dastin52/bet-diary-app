import React, { useState } from 'react';
import Card from './ui/Card';
import Input from './ui/Input';
import { useBetContext } from '../contexts/BetContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export const ProAnalyticsPanel: React.FC = () => {
  const { analytics, bankroll } = useBetContext();
  const { avgOdds, avgStake, longestWinStreak, longestLoseStreak, maxDrawdown, profitByBookmaker } = analytics;

  // Kelly Calculator State
  const [winProb, setWinProb] = useState<number>(55);
  const [odds, setOdds] = useState<number>(2.0);
  const [fraction, setFraction] = useState<number>(0.5); // Half Kelly default

  const b = odds - 1;
  const p = winProb / 100;
  const q = 1 - p;

  // Kelly formula: (bp - q) / b = (p*(b+1) - 1)/b
  const fullKellyFraction = b > 0 ? (b * p - q) / b : 0;
  const targetFraction = Math.max(0, fullKellyFraction * fraction);
  const recommendedStake = Math.round(bankroll * targetFraction);
  const expectedValuePct = ((p * odds - 1) * 100);

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/20">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Средний коэффициент</p>
          <p className="text-2xl font-bold text-indigo-500 dark:text-indigo-400 mt-1">{avgOdds ? avgOdds.toFixed(2) : '0.00'}</p>
          <p className="text-xs text-gray-400 mt-1">По всем рассчитанным ставкам</p>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Средняя ставка</p>
          <p className="text-2xl font-bold text-blue-500 dark:text-blue-400 mt-1">{avgStake ? `${avgStake.toFixed(0)} ₽` : '0 ₽'}</p>
          <p className="text-xs text-gray-400 mt-1">{bankroll > 0 ? `${((avgStake / bankroll) * 100).toFixed(1)}% от банка` : '0%'}</p>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Стрики (Поб / Проигр)</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-emerald-500">+{longestWinStreak}</span>
            <span className="text-gray-400">/</span>
            <span className="text-2xl font-bold text-rose-500">-{longestLoseStreak}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Максимальная серия</p>
        </Card>

        <Card className="bg-gradient-to-br from-rose-500/10 to-transparent border-rose-500/20">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Макс. Просадка</p>
          <p className="text-2xl font-bold text-rose-500 mt-1">-{maxDrawdown.value.toFixed(0)} ₽</p>
          <p className="text-xs text-gray-400 mt-1">-{maxDrawdown.percentage.toFixed(1)}% от пика</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kelly Criterion Calculator */}
        <Card className="border-indigo-500/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                ⚡ Калькулятор Келли (Kelly Criterion)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Оптимальный размер ставки для управления риском банкролла.
              </p>
            </div>
            <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded font-mono border border-indigo-500/20">
              SaaS Pro
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Оценка вероятности (%)</label>
              <Input
                type="number"
                min="1"
                max="99"
                value={winProb}
                onChange={(e) => setWinProb(Math.min(99, Math.max(1, parseFloat(e.target.value) || 0)))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Коэффициент</label>
              <Input
                type="number"
                step="0.05"
                min="1.01"
                value={odds}
                onChange={(e) => setOdds(Math.max(1.01, parseFloat(e.target.value) || 1.01))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Дробь Келли</label>
              <select
                value={fraction}
                onChange={(e) => setFraction(parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
              >
                <option value={1}>Full Kelly (100%)</option>
                <option value={0.5}>Half Kelly (50%) — Реком.</option>
                <option value={0.25}>Quarter Kelly (25%)</option>
              </select>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/60 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Математическое ожидание (EV):</span>
              <span className={`text-sm font-bold ${expectedValuePct > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {expectedValuePct > 0 ? '+' : ''}{expectedValuePct.toFixed(1)}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Рекомендуемая доля банка:</span>
              <span className="text-sm font-bold text-indigo-400 font-mono">
                {(targetFraction * 100).toFixed(2)}%
              </span>
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <span className="text-base font-semibold">Рекомендуемая сумма:</span>
              <span className="text-2xl font-extrabold text-green-500 font-mono">
                {recommendedStake > 0 ? `${recommendedStake.toLocaleString('ru-RU')} ₽` : '0 ₽ (Не ставить)'}
              </span>
            </div>

            {expectedValuePct <= 0 && (
              <p className="text-xs text-rose-400 mt-1">
                ⚠️ Отрицательное математическое ожидание (EV &lt; 0). Ставка не рекомендуется!
              </p>
            )}
          </div>
        </Card>

        {/* Profit by Bookmaker */}
        <Card>
          <h3 className="text-lg font-semibold mb-4">Результаты по Букмекеры</h3>
          {profitByBookmaker.length > 0 ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={profitByBookmaker} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                  <XAxis dataKey="bookmaker" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 11 }} />
                  <YAxis stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-gray-800 text-white p-2 text-xs rounded shadow border border-gray-700">
                            <p className="font-bold">{data.bookmaker}</p>
                            <p className={data.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                              Прибыль: {data.profit.toFixed(2)} ₽
                            </p>
                            <p>ROI: {data.roi.toFixed(1)}%</p>
                            <p>Ставок: {data.count}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="profit" name="Прибыль">
                    {profitByBookmaker.map((entry, index) => (
                      <Cell key={`bm-cell-${index}`} fill={entry.profit >= 0 ? '#48BB78' : '#F56565'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-sm text-gray-500">
              Нет данных по букмекерам. Добавьте рассчитанные ставки.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ProAnalyticsPanel;
