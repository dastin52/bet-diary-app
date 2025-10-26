import React from 'react';

// A generic type for tooltip props from Recharts
interface TooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string | number;
}

export const LineChartTooltip: React.FC<TooltipProps> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm shadow-lg">
          <p className="label text-gray-600 dark:text-gray-300">{`Дата : ${label}`}</p>
          <p className="intro text-indigo-600 dark:text-indigo-400">{`Баланс : ${payload[0].value.toFixed(2)} ₽`}</p>
        </div>
      );
    }
    return null;
};


export const BarChartTooltip: React.FC<TooltipProps> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const profit = data.profit;
      const roi = data.roi;
      const profitColor = profit >= 0 ? 'text-green-500' : 'text-red-500';
      return (
        <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm shadow-lg">
          <p className="label text-gray-800 dark:text-gray-300 font-semibold">{label}</p>
          <p className={`intro ${profitColor}`}>{`Прибыль: ${profit.toFixed(2)} ₽`}</p>
          {roi !== undefined && <p className="text-gray-500 dark:text-gray-400">{`ROI: ${roi.toFixed(2)}%`}</p>}
        </div>
      );
    }
    return null;
};

export const StackedBarChartTooltip: React.FC<TooltipProps> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const winsPayload = payload.find(p => p.dataKey === 'wins');
        const lossesPayload = payload.find(p => p.dataKey === 'losses');

        return (
            <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm shadow-lg">
                <p className="label text-gray-800 dark:text-gray-300 font-semibold">{label}</p>
                {winsPayload && <p className="text-green-500">{`Выигрыши: ${winsPayload.value}`}</p>}
                {lossesPayload && <p className="text-red-500">{`Проигрыши: ${lossesPayload.value}`}</p>}
            </div>
        );
    }
    return null;
};

export const OddsPerformanceTooltip: React.FC<TooltipProps> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const totalBets = data.wins + data.losses;
        
        return (
            <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm shadow-lg">
                <p className="label text-gray-800 dark:text-gray-300 font-semibold">{`Коэф: ${label}`}</p>
                <p className="text-green-500">{`Выигрыши: ${data.wins}`}</p>
                <p className="text-red-500">{`Проигрыши: ${data.losses}`}</p>
                <p className="text-gray-500 dark:text-gray-400">{`Всего ставок: ${totalBets}`}</p>
                <p className="text-gray-500 dark:text-gray-400">{`Проходимость: ${data.winRate.toFixed(1)}%`}</p>
                <p className={data.roi >= 0 ? 'text-green-500' : 'text-red-500'}>{`ROI: ${data.roi.toFixed(2)}%`}</p>
            </div>
        );
    }
    return null;
};


export const AIPredictionAccuracyTooltip: React.FC<TooltipProps> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        
        return (
            <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm shadow-lg">
                <p className="label text-gray-800 dark:text-gray-300 font-semibold">{label}</p>
                <p className="text-indigo-600 dark:text-indigo-400">{`Точность: ${data.accuracy.toFixed(1)}%`}</p>
                <p className="text-gray-500 dark:text-gray-400">{`Оценок: ${data.count}`}</p>
            </div>
        );
    }
    return null;
};