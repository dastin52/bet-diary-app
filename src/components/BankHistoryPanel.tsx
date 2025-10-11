import React from 'react';
import { useBetContext } from '../contexts/BetContext';
import Card from './ui/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BankTransaction, BankTransactionType } from '../types';
import { LineChartTooltip } from './charts/ChartTooltip';

const getTransactionTypeInfo = (type: BankTransactionType): { label: string, colorClass: string } => {
    switch (type) {
        case BankTransactionType.Deposit:
            return { label: 'Пополнение', colorClass: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' };
        case BankTransactionType.Withdrawal:
            return { label: 'Вывод', colorClass: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400' };
        case BankTransactionType.BetWin:
            return { label: 'Выигрыш', colorClass: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' };
        case BankTransactionType.BetLoss:
            return { label: 'Проигрыш', colorClass: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400' };
        case BankTransactionType.BetVoid:
        case BankTransactionType.Correction:
            return { label: 'Возврат/Корр.', colorClass: 'bg-gray-200 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400' };
        case BankTransactionType.BetCashout:
            return { label: 'Кэшаут', colorClass: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' };
        default:
            return { label: 'Неизвестно', colorClass: 'bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-300' };
    }
};

const BankHistoryPanel: React.FC = () => {
    const { bankHistory } = useBetContext();

    const chartData = [...bankHistory]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map(t => ({
            date: new Date(t.timestamp).toLocaleString('ru-RU'),
            balance: t.newBalance,
        }));

    return (
        <div className="space-y-6">
            <Card>
                <h3 className="text-lg font-semibold mb-4">Динамика Банка</h3>
                {chartData.length > 1 ? (
                    <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
                        <XAxis dataKey="date" stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} />
                        <YAxis stroke="currentColor" className="text-gray-500 dark:text-gray-400" tick={{ fontSize: 12 }} domain={['dataMin', 'dataMax']} />
                        <Tooltip content={<LineChartTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="balance" name="Баланс" stroke="#8884d8" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="text-center text-gray-500 py-10">Недостаточно данных для построения графика.</p>
                )}
            </Card>

            <Card>
                 <h3 className="text-lg font-semibold mb-4">Журнал Транзакций</h3>
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-100 dark:bg-gray-800">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Дата</th>
                            <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Тип</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Описание</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Изменение</th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Итоговый Баланс</th>
                        </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {bankHistory.length > 0 ? (
                            bankHistory.map((tx) => {
                                const typeInfo = getTransactionTypeInfo(tx.type);
                                const amountColor = tx.amount > 0 ? 'text-green-500' : tx.amount < 0 ? 'text-red-500' : 'text-gray-800 dark:text-gray-300';
                                return (
                                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(tx.timestamp).toLocaleString('ru-RU')}</td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${typeInfo.colorClass}`}>
                                                {typeInfo.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-300 max-w-xs truncate">{tx.description}</td>
                                        <td className={`px-4 py-3 text-sm text-right font-medium ${amountColor}`}>{tx.amount.toFixed(2)} ₽</td>
                                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white">{tx.newBalance.toFixed(2)} ₽</td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={5} className="text-center py-10 text-gray-500">
                                    История транзакций пуста.
                                </td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                 </div>
            </Card>
        </div>
    );
};

export default BankHistoryPanel;