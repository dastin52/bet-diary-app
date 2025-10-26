import React, { useState } from 'react';
import { useBetContext } from '../contexts/BetContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import Card from './ui/Card';
import AICard from './AICard';
import KpiCard from './ui/KpiCard';
import UpcomingMatches from './UpcomingMatches';
import MatchDetailsModal from './MatchDetailsModal';
import { Goal, SharedPrediction } from '../types';
import { LineChartTooltip, BarChartTooltip, StackedBarChartTooltip, OddsPerformanceTooltip } from './charts/ChartTooltip';
import { getGoalProgress } from '../utils/goalUtils';

const TrophyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.5,4.5a2.5,2.5,0,0,0-2-2.45V1h-11V2.05a2.5,2.5,0,0,0-2,2.45V10h15Z" opacity=".3"></path><path d="M19.5,2H17V1a1,1,0,0,0-1-1H8A1,1,0,0,0,7,1V2H4.5A2.5,2.5,0,0,0,2,4.5V10a1,1,0,0,0,1,1H5.16l.33,2.51A4,4,0,0,0,9.41,17H10v1H8a1,1,0,0,0,0,2h8a1,1,0,0,0,0,2H14V17h.59a4,4,0,0,0,3.92-3.49l.33-2.51H21a1,1,0,0,0,1-1V4.5A2.5,2.5,0,0,0,19.5,2ZM12,15a2,2,0,0,1-1.92-2.51l-.33-2.49h4.5l-.33,2.49A2,2,0,0,1,12,15Zm7.5-6H4.5V4.5a.5.5,0,0,1,.5-.5H19a.5.5,0,0,1,.5,.5Z"></path>
    </svg>
);


interface GoalProgressCardProps {
  goals: Goal[];
}

const GoalProgressCard: React.FC<GoalProgressCardProps> = ({ goals }) => {
  const activeGoals = goals.filter(g => g.status === 'in_progress');

  if (activeGoals.length === 0) {
    return null;
  }

  return (
    <Card>
      <div className="flex items-center gap-4 mb-4">
        <TrophyIcon />
        <div>
          <h3 className="text-lg font-semibold">Прогресс по целям</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Ваши активные цели на данный момент.</p>
        </div>
      </div>
      <div className="space-y-4">
        {activeGoals.map(goal => {
            const { percentage, label } = getGoalProgress(goal);
            const isAchieved = goal.status === 'achieved';
            return (
                 <div key={goal.id}>
                    <p className="text-sm font-medium mb-1">{goal.title}</p>
                    <div className="flex justify-between mb-1 text-xs">
                        <span className={`font-medium ${goal.currentValue >= 0 ? 'text-green-500' : 'text-red-500'}`}>{label}</span>
                        <span className="font-medium text-gray-600 dark:text-gray-300">{percentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div
                        className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                        ></div>
                    </div>
                     {isAchieved && <p className="mt-2 text-center text-xs font-bold text-green-500">🎉 Цель достигнута!</p>}
                </div>
            )
        })}
      </div>
    </Card>
  );
};


interface DashboardProps {
  onOpenAIChat: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onOpenAIChat }) => {
  const { analytics, bankroll, goals } = useBetContext();
  const { totalProfit, roi, betCount, balanceHistory, profitBySport, profitByBetType, winLossBySport, performanceByOdds } = analytics;
  const [selectedMatch, setSelectedMatch] = useState<SharedPrediction | null>(null);

  const profitColor = totalProfit >= 0 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard title="Текущий банк" value={`${bankroll.toFixed(2)} ₽`} subtext="Ваши доступные средства" colorClass="text-indigo-500 dark:text-indigo-400" />
        <KpiCard title="Общая прибыль" value={`${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}`} colorClass={profitColor} subtext="Прибыль/убыток по всем ставкам"/>
        <KpiCard title="ROI / Доходность" value={`${roi.toFixed(2)}%`} subtext="Возврат инвестиций" colorClass={roi >= 0 ? 'text-green-500' : 'text-red-500'} />
        <KpiCard title="Рассчитано ставок" value={String(betCount)} subtext="Общее количество ставок" />
      </div>

      <GoalProgressCard goals={goals} />
      
      <AICard onClick={onOpenAIChat} />

      <UpcomingMatches onMatchClick={setSelectedMatch} />

      <Card>
        <h3 className="text-lg font-semibold mb-4">История баланса</h3>
        <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
            <LineChart data={balanceHistory} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
            <XAxis dataKey="date" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
            <YAxis stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} domain={['dataMin', 'dataMax']} />
            <Tooltip content={<LineChartTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="balance" name="Баланс" stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }} />
            </LineChart>
        </ResponsiveContainer>
        </div>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
            <h3 className="text-lg font-semibold mb-4">Прибыль по видам спорта</h3>
            <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={profitBySport} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                <XAxis dataKey="sport" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                <YAxis stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                <Tooltip cursor={{fill: 'rgba(136, 132, 216, 0.1)'}} content={<BarChartTooltip />} />
                <Bar dataKey="profit" name="Прибыль">
                  {profitBySport.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#48BB78' : '#F56565'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
        </Card>
        <Card>
            <h3 className="text-lg font-semibold mb-4">Прибыль по типам ставок</h3>
            <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={profitByBetType} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                <XAxis dataKey="type" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                <YAxis stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                <Tooltip cursor={{fill: 'rgba(136, 132, 216, 0.1)'}} content={<BarChartTooltip />}/>
                <Bar dataKey="profit" name="Прибыль">
                  {profitByBetType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#48BB78' : '#F56565'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
        </Card>
      </div>

       <Card>
        <h3 className="text-lg font-semibold mb-4">Соотношение Выигрышей/Проигрышей по Спортам</h3>
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <BarChart
                    data={winLossBySport}
                    margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                    layout="vertical"
                    barCategoryGap="20%"
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                    <XAxis type="number" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="sport" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} width={80} />
                    <Tooltip cursor={{ fill: 'rgba(136, 132, 216, 0.1)' }} content={<StackedBarChartTooltip />} />
                    <Legend />
                    <Bar dataKey="wins" stackId="a" name="Выигрыши" fill="#48BB78" />
                    <Bar dataKey="losses" stackId="a" name="Проигрыши" fill="#F56565" />
                </BarChart>
            </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-4">Проходимость по Коэффициентам</h3>
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <BarChart
                    data={performanceByOdds}
                    margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                    <XAxis dataKey="range" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                    <YAxis stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'rgba(136, 132, 216, 0.1)' }} content={<OddsPerformanceTooltip />} />
                    <Legend />
                    <Bar dataKey="wins" stackId="a" name="Выигрыши" fill="#48BB78" />
                    <Bar dataKey="losses" stackId="a" name="Проигрыши" fill="#F56565" />
                </BarChart>
            </ResponsiveContainer>
        </div>
      </Card>
      
      {selectedMatch && <MatchDetailsModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />}
    </div>
  );
};

export default Dashboard;