
import React, { useState, useMemo } from 'react';
import { useBetContext } from '../contexts/BetContext';
import { Bet, BetStatus, BetType } from '../types';
import { BET_STATUS_OPTIONS, BOOKMAKERS, SPORTS } from '../constants';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';

const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><polyline points="20 6 9 17 4 12"></polyline></svg>
);
const XCrossIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);
const DashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);

const ImportIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.905 3.079V2.75z" />
        <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
);


interface BetLogRowProps {
    bet: Bet; 
    onDelete: (id: string) => void; 
    onEdit: (bet: Bet) => void; 
    onView: (bet: Bet) => void;
    onDiscuss: (bet: Bet) => void;
    isDemoMode: boolean;
    onAuthRequired: () => void;
}

const BetLogRow: React.FC<BetLogRowProps> = ({ bet, onDelete, onEdit, onView, onDiscuss, isDemoMode, onAuthRequired }) => {
    const { updateBet } = useBetContext();
    
    const getStatusClass = (status: BetStatus) => {
        switch (status) {
            case BetStatus.Won: return 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400';
            case BetStatus.Lost: return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400';
            case BetStatus.Pending: return 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400';
            case BetStatus.Void: return 'bg-gray-200 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400';
            case BetStatus.CashedOut: return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400';
            default: return 'bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
        }
    };
    
    const statusLabel = BET_STATUS_OPTIONS.find(o => o.value === bet.status)?.label || bet.status;

    const handleStatusUpdate = (newStatus: BetStatus) => {
        if (isDemoMode) {
            onAuthRequired();
            return;
        }
        updateBet(bet.id, { status: newStatus });
    };

    return (
        <tr className={`border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-150`}>
            <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-300 align-top cursor-pointer" onClick={() => onView(bet)}>
                <div className="font-medium text-gray-900 dark:text-white">{bet.event}</div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">{bet.sport} | {new Date(bet.createdAt).toLocaleString('ru-RU')}</div>
            </td>
            <td className="px-4 py-3 text-sm text-center align-top">{bet.stake.toFixed(2)} ₽</td>
            <td className="px-4 py-3 text-sm text-center align-top">{bet.odds.toFixed(2)}</td>
            <td className="px-4 py-3 text-sm text-center align-top">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusClass(bet.status)}`}>
                    {statusLabel}
                </span>
            </td>
            <td className="px-4 py-3 text-sm text-center font-medium align-top">
                {bet.status !== BetStatus.Pending ? (
                    <span className={bet.profit && bet.profit > 0 ? 'text-green-500' : bet.profit && bet.profit < 0 ? 'text-red-500' : 'text-gray-800 dark:text-gray-300'}>
                        {bet.profit?.toFixed(2)} ₽
                    </span>
                ) : '-'}
            </td>
            <td className="px-4 py-3 text-sm text-center align-top">
                <div className="flex flex-wrap justify-center items-center gap-2">
                    {bet.status === BetStatus.Pending ? (
                        <div className="flex gap-1">
                           <button title="Выигрыш" onClick={() => handleStatusUpdate(BetStatus.Won)} className="p-2 rounded-full hover:bg-green-200 dark:hover:bg-green-500/20 text-green-500"><CheckIcon /></button>
                           <button title="Проигрыш" onClick={() => handleStatusUpdate(BetStatus.Lost)} className="p-2 rounded-full hover:bg-red-200 dark:hover:bg-red-500/20 text-red-500"><XCrossIcon /></button>
                           <button title="Возврат" onClick={() => handleStatusUpdate(BetStatus.Void)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-500/20 text-gray-500"><DashIcon /></button>
                        </div>
                    ) : null}
                     <button type="button" title="Редактировать" className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-indigo-500 dark:hover:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors" onClick={isDemoMode ? onAuthRequired : () => onEdit(bet)}>
                        <EditIcon />
                    </button>
                    <button type="button" title="Удалить" className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-red-500 dark:hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors" onClick={isDemoMode ? onAuthRequired : () => onDelete(bet.id)}>
                        <TrashIcon />
                    </button>
                </div>
            </td>
        </tr>
    );
};

interface BetLogProps {
    onEditBet: (bet: Bet) => void;
    onViewBet: (bet: Bet) => void;
    onDiscussBet: (bet: Bet) => void;
    onImportBets: () => void;
    isDemoMode: boolean;
    onAuthRequired: () => void;
}


const BetLog: React.FC<BetLogProps> = ({ onEditBet, onViewBet, onDiscussBet, onImportBets, isDemoMode, onAuthRequired }) => {
  const { bets, deleteBet } = useBetContext();
  const [filters, setFilters] = useState({
    status: 'all',
    sport: 'all',
    bookmaker: 'all',
    search: '',
    startDate: '',
    endDate: ''
  });

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const filteredBets = useMemo(() => {
    return bets.filter(bet => {
        const lowerSearch = filters.search.toLowerCase();
        const searchMatch = filters.search === '' || 
            bet.event.toLowerCase().includes(lowerSearch) ||
            (bet.tags && bet.tags.some(t => t.toLowerCase().includes(lowerSearch)));

        const statusMatch = filters.status === 'all' || bet.status === filters.status;
        const sportMatch = filters.sport === 'all' || bet.sport === filters.sport;
        const bookmakerMatch = filters.bookmaker === 'all' || bet.bookmaker === filters.bookmaker;
        const startDateMatch = filters.startDate === '' || new Date(bet.createdAt) >= new Date(filters.startDate);
        const endDateMatch = filters.endDate === '' || new Date(bet.createdAt) <= new Date(filters.endDate + 'T23:59:59');

        return searchMatch && statusMatch && sportMatch && bookmakerMatch && startDateMatch && endDateMatch;
    });
  }, [bets, filters]);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <h2 className="text-xl font-semibold">История ставок</h2>
            <Button onClick={onImportBets} variant="secondary"><ImportIcon /> Импорт из CSV</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <Input type="text" name="search" placeholder="Поиск по событию, тегу..." value={filters.search} onChange={handleFilterChange} />
            <Select name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="all">Все статусы</option>
                {BET_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </Select>
            <Select name="sport" value={filters.sport} onChange={handleFilterChange}>
                <option value="all">Все виды спорта</option>
                {SPORTS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </Select>
            <Select name="bookmaker" value={filters.bookmaker} onChange={handleFilterChange}>
                <option value="all">Все букмекеры</option>
                {BOOKMAKERS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </Select>
            <div className="flex items-center gap-2 lg:col-span-2">
                <Input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                 <span className="text-gray-500">-</span>
                <Input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Событие</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ставка</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Коэф.</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Статус</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Прибыль/Убыток</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Действия</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredBets.length > 0 ? (
                filteredBets.map(bet => (
                  <BetLogRow 
                    key={bet.id} 
                    bet={bet} 
                    onDelete={deleteBet} 
                    onEdit={onEditBet} 
                    onView={onViewBet}
                    onDiscuss={onDiscussBet}
                    isDemoMode={isDemoMode}
                    onAuthRequired={onAuthRequired}
                    />
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500">
                    Ставок не найдено.
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

export default BetLog;