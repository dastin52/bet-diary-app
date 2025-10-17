import React from 'react';
import { useBetContext } from '../contexts/BetContext';
import Card from './ui/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BankTransaction, BankTransactionType } from '../types';
import { LineChartTooltip } from './charts/ChartTooltip';
import Button from './ui/Button';

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
    const { bankHistory, analytics, bankroll } = useBetContext();

    const chartData = [...bankHistory]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map(t => ({
            date: new Date(t.timestamp).toLocaleString('ru-RU'),
            balance: t.newBalance,
        }));

    const handleDownloadReport = () => {
        const { totalProfit, roi, turnover, betCount, lostBetsCount, winRate, profitBySport, profitByBetType, winLossBySport, performanceByOdds } = analytics;

        const generateKpiHtml = (title: string, value: string, colorClass: string = '') => `
            <div class="kpi">
                <h3>${title}</h3>
                <p class="value ${colorClass}">${value}</p>
            </div>
        `;

        const generateTableHtml = (title: string, headers: string[], rows: (string | number)[][]) => {
            let table = `<h2>${title}</h2><table><thead><tr>`;
            headers.forEach(h => table += `<th>${h}</th>`);
            table += `</tr></thead><tbody>`;
            rows.forEach(row => {
                table += `<tr>`;
                row.forEach((cell, index) => {
                     let cellClass = '';
                    if (headers[index].includes('Прибыль') || headers[index].includes('ROI')) {
                        const numericValue = typeof cell === 'string' ? parseFloat(cell) : cell;
                        if (numericValue > 0) cellClass = 'positive';
                        if (numericValue < 0) cellClass = 'negative';
                    }
                    table += `<td class="${cellClass}">${cell}</td>`;
                });
                table += `</tr>`;
            });
            table += `</tbody></table>`;
            return table;
        };
        
        const reportDate = new Date().toLocaleString('ru-RU');

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Аналитический отчет - Дневник Ставок</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #1f2937; margin: 0; padding: 2rem; }
                    .container { max-width: 800px; margin: auto; background: #fff; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    h1 { color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
                    h2 { color: #374151; margin-top: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem;}
                    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
                    .kpi { background-color: #f9fafb; padding: 1rem; border-radius: 0.5rem; text-align: center; border: 1px solid #e5e7eb; }
                    .kpi h3 { margin: 0; font-size: 0.875rem; color: #6b7280; }
                    .kpi .value { margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: bold; }
                    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
                    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
                    th { background-color: #f9fafb; font-size: 0.8rem; text-transform: uppercase; color: #6b7280; }
                    td { font-size: 0.9rem; }
                    .positive { color: #10b981; font-weight: bold; }
                    .negative { color: #ef4444; font-weight: bold; }
                    .footer { margin-top: 2rem; text-align: center; font-size: 0.75rem; color: #9ca3af; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Аналитический отчет</h1>
                    <p class="footer">Сформирован: ${reportDate}</p>
                    
                    <h2>Ключевые показатели</h2>
                    <div class="kpi-grid">
                        ${generateKpiHtml('Текущий банк', `${bankroll.toFixed(2)} ₽`)}
                        ${generateKpiHtml('Общая прибыль', `${totalProfit.toFixed(2)} ₽`, totalProfit > 0 ? 'positive' : 'negative')}
                        ${generateKpiHtml('ROI', `${roi.toFixed(2)}%`, roi > 0 ? 'positive' : 'negative')}
                        ${generateKpiHtml('Оборот', `${turnover.toFixed(2)} ₽`)}
                        ${generateKpiHtml('Всего ставок', `${betCount}`)}
                        ${generateKpiHtml('Процент побед', `${winRate.toFixed(2)}%`)}
                    </div>

                    ${generateTableHtml(
                        'Прибыль по видам спорта',
                        ['Спорт', 'Прибыль (₽)', 'ROI (%)'],
                        profitBySport.map(p => [p.sport, p.profit.toFixed(2), p.roi.toFixed(2)])
                    )}
                    
                    ${generateTableHtml(
                        'Прибыль по типам ставок',
                        ['Тип ставки', 'Прибыль (₽)', 'ROI (%)'],
                        profitByBetType.map(p => [p.type, p.profit.toFixed(2), p.roi.toFixed(2)])
                    )}

                    ${generateTableHtml(
                        'Соотношение выигрышей/проигрышей',
                        ['Спорт', 'Выигрыши', 'Проигрыши'],
                        winLossBySport.map(s => [s.sport, s.wins, s.losses])
                    )}

                    ${generateTableHtml(
                        'Проходимость по коэффициентам',
                        ['Диапазон коэф.', 'Выигрыши', 'Проигрыши', 'Проходимость (%)', 'ROI (%)'],
                        performanceByOdds.map(p => [p.range, p.wins, p.losses, p.winRate.toFixed(1), p.roi.toFixed(2)])
                    )}

                    <div class="footer">© Дневник Ставок</div>
                </div>
            </body>
            </html>
        `;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `bet_diary_report_${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };

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
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Журнал Транзакций</h3>
                    <Button onClick={handleDownloadReport} variant="secondary">Скачать отчет</Button>
                </div>
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
