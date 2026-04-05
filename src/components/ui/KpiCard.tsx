import React from 'react';
import Card from './Card';

interface KpiCardProps {
  title: string;
  value: string;
  subtext?: string;
  colorClass?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtext, colorClass = 'text-gray-900 dark:text-white' }) => (
  <Card className="p-3 md:p-6">
    <h3 className="text-[10px] md:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</h3>
    <p className={`text-xl md:text-3xl font-bold mt-1 md:mt-2 ${colorClass}`}>{value}</p>
    {subtext && <p className="text-[10px] md:text-xs text-gray-500 mt-0.5 md:mt-1">{subtext}</p>}
  </Card>
);

export default KpiCard;