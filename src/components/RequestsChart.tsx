import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ApiActivityLog } from '../types';
import Card from './ui/Card';

const COLORS: { [key: string]: string } = {
    Football: '#ef4444',
    AFL: '#f97316',
    Baseball: '#eab308',
    Basketball: '#84cc16',
    'Formula-1': '#22c55e',
    Handball: '#14b8a6',
    Hockey: '#06b6d4',
    MMA: '#3b82f6',
    NBA: '#6366f1',
    NFL: '#8b5cf6',
    Rugby: '#a855f7',
    Volleyball: '#d946ef',
};

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-gray-800 p-2 border border-gray-700 rounded-md text-sm shadow-lg">
                <p className="font-bold">{`Час: ${label}:00`}</p>
                {payload.map((pld: any) => (
                    <div key={pld.dataKey} style={{ color: pld.color }}>
                        {`${pld.dataKey}: ${pld.value}`}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const RequestsChart: React.FC<{ activityLog: ApiActivityLog[] }> = ({ activityLog }) => {
    const { chartData, sports } = useMemo(() => {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const relevantLogs = activityLog.filter(log => new Date(log.timestamp) > twentyFourHoursAgo);
        
        const hourlyData: { [hour: number]: { [sport: string]: number } } = {};
        const sportSet = new Set<string>();

        for (let i = 0; i < 24; i++) {
            hourlyData[i] = {};
        }

        relevantLogs.forEach(log => {
            const hour = new Date(log.timestamp).getHours();
            const sportKey = log.sport.charAt(0).toUpperCase() + log.sport.slice(1);
            sportSet.add(sportKey);
            if (!hourlyData[hour]) hourlyData[hour] = {};
            hourlyData[hour][sportKey] = (hourlyData[hour][sportKey] || 0) + 1;
        });

        const chartData = Object.entries(hourlyData).map(([hour, sportCounts]) => ({
            hour: `${hour}h`,
            ...sportCounts
        }));

        return { chartData, sports: Array.from(sportSet) };
    }, [activityLog]);
    
    return (
        <Card>
            <h3 className="text-lg font-semibold mb-4">Requests</h3>
            <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <defs>
                         {Object.entries(COLORS).map(([sport, color]) => (
                            <linearGradient key={sport} id={`color${sport}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                                <stop offset="95%" stopColor={color} stopOpacity={0}/>
                            </linearGradient>
                         ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                    <XAxis dataKey="hour" stroke="#A0AEC0" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#A0AEC0" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    {sports.map(sport => (
                         <Area key={sport} type="monotone" dataKey={sport} stroke={COLORS[sport] || '#ccc'} fillOpacity={1} fill={`url(#color${sport})`} />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 text-xs">
                {Object.entries(COLORS).map(([name, color]) => (
                     <div key={name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
                        <span>{name}</span>
                    </div>
                ))}
            </div>
        </Card>
    );
};

export default RequestsChart;