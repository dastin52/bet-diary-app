import React from 'react';
import { ApiActivityLog } from '../types';
import Card from './ui/Card';

const StatusDot: React.FC<{ status: 'success' | 'error' }> = ({ status }) => (
    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${status === 'success' ? 'bg-green-500' : 'bg-red-500'}`}></div>
);

const ActivityTimeline: React.FC<{ activityLog: ApiActivityLog[] }> = ({ activityLog }) => {
    return (
        <Card className="h-full">
            <h3 className="text-lg font-semibold mb-4">My Activity</h3>
            {activityLog.length === 0 ? (
                <p className="text-sm text-center text-gray-500 py-10">Нет данных об активности API.</p>
            ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {activityLog.map((log) => (
                        <div key={log.timestamp} className="relative pl-6">
                            <div className="absolute left-1 top-1">
                                <StatusDot status={log.status} />
                                <div className="absolute left-1/2 top-3 h-full w-px bg-gray-700"></div>
                            </div>
                            <p className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleTimeString('ru-RU')}</p>
                            <p className="text-sm font-medium break-all">{log.endpoint}</p>
                            <p className="text-sm font-bold text-cyan-400">#{log.sport}</p>
                            {log.status === 'error' && <p className="text-xs text-red-400 mt-1">{log.errorMessage}</p>}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};

export default ActivityTimeline;
