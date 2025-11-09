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

type AdminView = 'stats' | 'users' | 'ml_model' | 'team_analytics' | 'diagnostics';

const AdminPanel: React.FC = () => {
  const { users, allBets, analytics, activityLog, isLoading, updateUserStatus } = useAdminData();
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
        if (!response.ok) {
            throw new Error(data.error || 'Произошла неизвестная ошибка');
        }
        setUpdateMessage({ type: 'success', text: data.message });
        // Trigger a refresh of diagnostics data after the update
        setTimeout(() => setDiagnosticsRefreshKey(k => k + 1), 1000);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setUpdateMessage({ type: 'error', text: `Ошибка обновления: ${message}` });
    } finally {
        setIsUpdating(false);
    }
  };


  if (isLoading) {
    return (
        <div className="flex justify-center items-center h-full">
            <p className="text-lg text-gray-500 dark:text-gray-400">Загрузка данных администратора...</p>
        </div>
    );
  }

  if (!analytics) {
      return (
        <Card>
            <p className="text-center text-gray-500 dark:text-gray-400">Нет данных для отображения. Зарегистрируйте пользователей и добавьте ставки.</p>
        </Card>
      );
  }

  const profitColor = analytics.totalProfit >= 0 ? 'text-green-500' : 'text-red-500';
  const roiColor = analytics.platformRoi >= 0 ? 'text-green-500' : 'text-red-500';

  const renderContent = () => {
      switch (activeTab) {
          case 'stats':
              return (
                 <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Глобальная статистика платформы</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KpiCard title="Всего пользователей" value={String(analytics.totalUsers)} colorClass="text-indigo-500 dark:text-indigo-400" />
                        <KpiCard title="Всего ставок" value={String(analytics.totalBets)} />
                        <KpiCard title="Общая прибыль платформы" value={`${analytics.totalProfit.toFixed(2)} ₽`} colorClass={profitColor} />
                        <KpiCard title="ROI платформы" value={`${analytics.platformRoi.toFixed(2)}%`} colorClass={roiColor} />
                    </div>

                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <RequestsChart activityLog={activityLog} />
                        <ActivityTimeline activityLog={activityLog} />
                     </div>

                    <Card>
                        <h3 className="text-lg font-semibold mb-4">Прибыль по видам спорта (Все пользователи)</h3>
                        <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                        <BarChart data={analytics.profitBySport} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                            <XAxis dataKey="sport" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                            <YAxis stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                            <Tooltip cursor={{fill: 'rgba(136, 132, 216, 0.1)'}} content={<BarChartTooltip />} />
                            <Bar dataKey="profit" name="Прибыль">
                            {analytics.profitBySport.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#48BB78' : '#F56565'} />
                            ))}
                            </Bar>
                        </BarChart>
                        </ResponsiveContainer>
                        </div>
                    </Card>

                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <h3 className="text-lg font-semibold mb-4">Популярные виды спорта</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={analytics.popularSports} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                                    <XAxis type="number" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                                    <YAxis dataKey="name" type="category" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} width={80} />
                                    <Tooltip cursor={{ fill: 'rgba(136, 132, 216, 0.1)' }} />
                                    <Bar dataKey="count" name="Кол-во ставок" fill="#8884d8" />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                        <Card>
                            <h3 className="text-lg font-semibold mb-4">Популярные букмекеры</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={analytics.popularBookmakers} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                                    <XAxis type="number" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                                    <YAxis dataKey="name" type="category" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} width={80} />
                                    <Tooltip cursor={{ fill: 'rgba(136, 132, 216, 0.1)' }} />
                                    <Bar dataKey="count" name="Кол-во ставок" fill="#82ca9d" />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    </div>

                 </div>
              );
          case 'users':
              return (
                <Card>
                    <h2 className="text-xl font-semibold mb-4">Управление пользователями</h2>
                    <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-100 dark:bg-gray-800">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Никнейм</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Дата регистрации</th>
                            <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Статус</th>
                            <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Действия</th>
                        </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {users.length > 0 ? (
                            users.map(user => (
                            <tr key={user.email} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{user.nickname}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{user.email}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{new Date(user.registeredAt).toLocaleString('ru-RU')}</td>
                                <td className="px-4 py-3 text-sm text-center">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.status === 'active' ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'}`}>
                                        {user.status === 'active' ? 'Активен' : 'Заблокирован'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-center">
                                    {user.status === 'active' ? (
                                        <Button variant="secondary" className="!bg-red-100 dark:!bg-red-500/20 hover:!bg-red-200 dark:hover:!bg-red-500/40 !text-red-600 dark:!text-red-300 text-xs py-1 px-2" onClick={() => updateUserStatus(user.email, 'blocked')}>
                                            Заблокировать
                                        </Button>
                                    ) : (
                                        <Button variant="secondary" className="!bg-green-100 dark:!bg-green-500/20 hover:!bg-green-200 dark:hover:!bg-green-500/40 !text-green-600 dark:!text-green-300 text-xs py-1 px-2" onClick={() => updateUserStatus(user.email, 'active')}>
                                            Разблокировать
                                        </Button>
                                    )}
                                </td>
                            </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="text-center py-10 text-gray-500">
                                    Пользователи не найдены.
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                    </div>
                </Card>
              );
          case 'ml_model':
              return <GingerMLPanel allBets={allBets} />;
          case 'team_analytics':
              return <TeamAnalyticsPanel teamStats={analytics.teamAnalytics} />;
          case 'diagnostics':
              return <DiagnosticsPanel refreshKey={diagnosticsRefreshKey} onForceUpdate={handleForceUpdate} isUpdating={isUpdating} updateMessage={updateMessage} />;
      }
  }

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
            <Button variant={activeTab === 'stats' ? 'primary' : 'secondary'} onClick={() => setActiveTab('stats')}>Статистика</Button>
            <Button variant={activeTab === 'users' ? 'primary' : 'secondary'} onClick={() => setActiveTab('users')}>Управление пользователями</Button>
            <Button variant={activeTab === 'ml_model' ? 'primary' : 'secondary'} onClick={() => setActiveTab('ml_model')}>Джинджер (ML)</Button>
            <Button variant={activeTab === 'team_analytics' ? 'primary' : 'secondary'} onClick={() => setActiveTab('team_analytics')}>Аналитика команд</Button>
            <Button variant={activeTab === 'diagnostics' ? 'primary' : 'secondary'} onClick={() => { setActiveTab('diagnostics'); setDiagnosticsRefreshKey(k => k + 1); }}>Диагностика</Button>
        </div>
        <div>
            {renderContent()}
        </div>
    </div>
  );
};

export default AdminPanel;