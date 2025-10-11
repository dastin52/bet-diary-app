import React from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { Bet, BetStatus, BetType } from '../types';
import { BET_STATUS_OPTIONS, BET_TYPE_OPTIONS } from '../constants';

const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>;
const AiIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>;

const DetailRow: React.FC<{ label: string; value: React.ReactNode; }> = ({ label, value }) => (
    <div className="flex justify-between py-2 border-b border-gray-700/50">
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-sm font-semibold text-white">{value}</span>
    </div>
);

const BetDetailModal: React.FC<{ bet: Bet; onClose: () => void; onEdit: (bet: Bet) => void; onDiscuss: (bet: Bet) => void; }> = ({ bet, onClose, onEdit, onDiscuss }) => {
    
    const statusInfo = BET_STATUS_OPTIONS.find(o => o.value === bet.status);
    const getStatusClass = (status: BetStatus) => {
        switch (status) {
            case BetStatus.Won: return 'bg-green-500/20 text-green-400';
            case BetStatus.Lost: return 'bg-red-500/20 text-red-400';
            case BetStatus.Pending: return 'bg-yellow-500/20 text-yellow-400';
            case BetStatus.Void: return 'bg-gray-500/20 text-gray-400';
            case BetStatus.CashedOut: return 'bg-blue-500/20 text-blue-400';
            default: return 'bg-gray-700 text-gray-300';
        }
    };

    const profitColor = bet.profit && bet.profit > 0 ? 'text-green-400' : bet.profit && bet.profit < 0 ? 'text-red-400' : 'text-gray-300';

    return (
        <Modal title="Детали ставки" onClose={onClose}>
            <div className="space-y-4">
                <div className="p-3 bg-gray-700/50 rounded-lg">
                    <h3 className="font-bold text-lg text-white">{bet.event}</h3>
                    <p className="text-sm text-indigo-300">{bet.sport}</p>
                </div>

                {bet.betType === BetType.Parlay && bet.legs.length > 0 && (
                    <div>
                        <h4 className="font-semibold mb-2">События в экспрессе:</h4>
                        <ul className="space-y-1 text-sm list-decimal list-inside pl-2">
                            {bet.legs.map((leg, i) => <li key={i}>{`${leg.homeTeam} vs ${leg.awayTeam} - ${leg.market}`}</li>)}
                        </ul>
                    </div>
                )}
                
                <div className="space-y-1">
                    <DetailRow label="Дата" value={new Date(bet.createdAt).toLocaleString('ru-RU')} />
                    <DetailRow label="Букмекер" value={bet.bookmaker} />
                    <DetailRow label="Тип ставки" value={BET_TYPE_OPTIONS.find(o => o.value === bet.betType)?.label || bet.betType} />
                    <DetailRow label="Сумма" value={`${bet.stake.toFixed(2)} ₽`} />
                    <DetailRow label="Коэффициент" value={bet.odds.toFixed(2)} />
                    <DetailRow label="Статус" value={<span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusClass(bet.status)}`}>{statusInfo?.label}</span>} />
                    {bet.status !== BetStatus.Pending && <DetailRow label="Прибыль/Убыток" value={<span className={profitColor}>{bet.profit?.toFixed(2)} ₽</span>} />}
                    {bet.tags && bet.tags.length > 0 && <DetailRow label="Теги" value={bet.tags.join(', ')} />}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button variant="secondary" onClick={() => { onClose(); onEdit(bet); }}><EditIcon /> Редактировать</Button>
                    <Button onClick={() => { onClose(); onDiscuss(bet); }}><AiIcon /> Обсудить с AI</Button>
                </div>
            </div>
        </Modal>
    );
};

export default BetDetailModal;
