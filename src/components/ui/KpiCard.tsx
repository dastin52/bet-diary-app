
import React from 'react';
import Card from './Card';

interface KpiCardProps {
  title: string;
  value: string;
  subtext?: string;
  colorClass?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtext, colorClass = 'text-gray-900 dark:text-white' }) => (
  <Card>
    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>
    <p className={`text-3xl font-bold mt-2 ${colorClass}`}>{value}</p>
    {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
  </Card>
);

export default KpiCard;