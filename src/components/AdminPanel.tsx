import React, { useState } from 'react';
import { useAdminData } from '../hooks/useAdminData';
import Card from './ui/Card';
import KpiCard from './ui/KpiCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { BarChartTooltip } from './charts/ChartTooltip';
import Button from './ui/Button';
import GingerMLPanel from './MLModelPanel';
import TeamAnalyticsPanel from './TeamAnalyticsPanel';
import ActivityTimeline from './ActivityTimeline';
import RequestsChart from './RequestsChart';
import DiagnosticsPanel from './DiagnosticsPanel';

type AdminView = 'stats' | 'users' | 'ml_model' | 'team_analytics' | 'diagnostics' | 'twa_logs';

const AdminPanel: React.FC = () => {
  const { users, analytics, activityLog, twaLogs, isLoading, updateUserStatus, refreshTwaLogs } = useAdminData();
  const [activeTab, setActiveTab] = useState<AdminView>('stats');
  const [diagnosticsRefreshKey, setDiagnosticsRefreshKey] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{ type: 'info' | 'success' | 'error', text: string } | null>(null);

  const handleForceUpdate = async () => {
    setIsUpdating(true);
    setUpdateMessage({ type: 'info', text: 'Запускаю обновление прогнозов вручную...' });
    try {
        const response = await fetch('/api/tasks/run-update', { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Ошибка');
        setUpdateMessage({ type: 'success', text: data.message });
        setTimeout(() => setDiagnosticsRefreshKey(k => k + 1), 1000);
    } catch (e: any) {
        setUpdateMessage({ type: 'error', text: `Ошибка: ${e.message}` });
    } finally {
        setIsUpdating(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-full text-gray-400">Загрузка...</div>;
  }

  if (!analytics) return <Card>Нет данных.</Card>;

  const renderContent = () => {
      switch (activeTab) {
          case 'stats':
              return (
                 <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KpiCard title="Пользователи" value={String(analytics.totalUsers)} colorClass="text-indigo-400" />
                        <KpiCard title="Всего ставок" value={String(analytics.totalBets)} />
                        <KpiCard title="Прибыль" value={`${analytics.totalProfit.toFixed(2)} ₽`} colorClass={analytics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'} />
                        <KpiCard title="ROI" value={`${analytics.platformRoi.toFixed(2)}%`} colorClass={analytics.platformRoi >= 0 ? 'text-green-400' : 'text-red-400'} />
                    </div>
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <RequestsChart activityLog={activityLog} />
                        <ActivityTimeline activityLog={activityLog} />
                     </div>
                 </div>
              );
          case 'users':
              return (
                <Card>
                    <h2 className="text-xl font-semibold mb-4">Пользователи</h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-800 text-gray-400">
                                <tr>
                                    <th className="px-4 py-2 text-left">Никнейм</th>
                                    <th className="px-4 py-2 text-left">Email</th>
                                    <th className="px-4 py-2 text-center">Статус</th>
                                    <th className="px-4 py-2 text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {users.map(u => (
                                    <tr key={u.email}>
                                        <td className="px-4 py-3">{u.nickname}</td>
                                        <td className="px-4 py-3 text-gray-500">{u.email}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${u.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {u.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button onClick={() => updateUserStatus(u.email, u.status === 'active' ? 'blocked' : 'active')} className="text-indigo-400 hover:text-indigo-300">
                                                {u.status === 'active' ? 'Блок' : 'Разблок'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
              );
          case 'ml_model': return <GingerMLPanel />;
          case 'team_analytics': return <TeamAnalyticsPanel teamStats={analytics.teamAnalytics} />;
          case 'diagnostics': return <DiagnosticsPanel refreshKey={diagnosticsRefreshKey} onForceUpdate={handleForceUpdate} isUpdating={isUpdating} updateMessage={updateMessage} />;
          case 'twa_logs':
              return (
                  <div className="space-y-4">
                      <div className="flex justify-between items-center">
                          <h2 className="text-xl font-semibold text-fuchsia-400">TWA Live Debug Console</h2>
                          <Button onClick={refreshTwaLogs} variant="secondary">Обновить логи</Button>
                      </div>
                      <div className="space-y-2">
                          {twaLogs.length === 0 ? (
                              <Card><p className="text-center text-gray-500">Лента пуста. Ошибок от клиентов не поступало.</p></Card>
                          ) : twaLogs.map((log, i) => (
                              <div key={i} className={`p-4 rounded-lg border text-xs font-mono shadow-sm ${log.level === 'error' ? 'bg-red-900/10 border-red-800' : 'bg-gray-800 border-gray-700'}`}>
                                  <div className="flex justify-between items-center mb-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${log.level === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                                          {log.level}
                                      </span>
                                      <span className="text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                                  </div>
                                  <div className="font-bold text-gray-200 text-sm mb-1">{log.message}</div>
                                  <div className="text-indigo-300 mb-2 overflow-x-auto whitespace-pre-wrap">{log.details}</div>
                                  <div className="pt-2 border-t border-gray-700 text-[10px] text-gray-500">
                                      UA: {log.userAgent}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              );
      }
  }

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
            <Button variant={activeTab === 'stats' ? 'primary' : 'secondary'} onClick={() => setActiveTab('stats')}>Статистика</Button>
            <Button variant={activeTab === 'users' ? 'primary' : 'secondary'} onClick={() => setActiveTab('users')}>Пользователи</Button>
            <Button variant={activeTab === 'ml_model' ? 'primary' : 'secondary'} onClick={() => setActiveTab('ml_model')}>Модель Джинджер</Button>
            <Button variant={activeTab === 'diagnostics' ? 'primary' : 'secondary'} onClick={() => setActiveTab('diagnostics')}>Диагностика</Button>
            <Button variant={activeTab === 'twa_logs' ? 'primary' : 'secondary'} onClick={() => setActiveTab('twa_logs')}>TWA Debug (Живые ошибки)</Button>
        </div>
        <div>{renderContent()}</div>
    </div>
  );
};

export default AdminPanel;