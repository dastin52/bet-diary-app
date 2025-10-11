import React, { useState } from 'react';
import { useBetContext } from '../contexts/BetContext';
import Card from './ui/Card';
import Button from './ui/Button';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Label from './ui/Label';
import Select from './ui/Select';
import { Goal, GoalMetric, GoalStatus } from '../types';
import { getGoalProgress } from '../utils/goalUtils';
import { SPORTS, BET_TYPE_OPTIONS } from '../constants';

const GoalCard: React.FC<{ goal: Goal, onDelete: (id: string) => void }> = ({ goal, onDelete }) => {
    const { percentage, label } = getGoalProgress(goal);
    const isAchieved = goal.status === GoalStatus.Achieved;
    const isFailed = goal.status === GoalStatus.Failed;
    const isExpired = new Date() > new Date(goal.deadline) && !isAchieved;

    let progressColor = 'bg-indigo-500';
    if (isAchieved) progressColor = 'bg-green-500';
    if (isFailed || isExpired) progressColor = 'bg-red-500';

    return (
        <Card className={`relative overflow-hidden ${isFailed || isExpired ? 'opacity-70' : ''}`}>
            {isFailed && <div className="absolute top-2 right-2 text-xs font-bold text-red-500 bg-red-100 dark:bg-red-900/50 px-2 py-1 rounded">ПРОВАЛЕНО</div>}
            {isAchieved && <div className="absolute top-2 right-2 text-xs font-bold text-green-500 bg-green-100 dark:bg-green-900/50 px-2 py-1 rounded">ДОСТИГНУТО</div>}

            <h3 className="font-semibold text-lg">{goal.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Дедлайн: {new Date(goal.deadline).toLocaleDateString('ru-RU')}</p>
            <div>
                <div className="flex justify-between mb-1 text-sm">
                    <span className={`font-medium ${goal.currentValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>{label}</span>
                    <span className="font-medium text-gray-300">{percentage.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div
                        className={`${progressColor} h-2.5 rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                    ></div>
                </div>
            </div>
            <div className="mt-4 flex justify-end">
                 <Button variant="secondary" onClick={() => onDelete(goal.id)} className="text-xs !py-1 !px-2 !bg-red-200 dark:!bg-red-800/50 hover:!bg-red-300 dark:hover:!bg-red-800/80 !text-red-700 dark:!text-red-300">Удалить</Button>
            </div>
        </Card>
    );
};


const AddGoalModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { addGoal } = useBetContext();
    const [title, setTitle] = useState('');
    const [metric, setMetric] = useState<GoalMetric>(GoalMetric.Profit);
    const [targetValue, setTargetValue] = useState(1000);
    const [deadline, setDeadline] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [scopeType, setScopeType] = useState<'all' | 'sport' | 'betType' | 'tag'>('all');
    const [scopeValue, setScopeValue] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        addGoal({
            title,
            metric,
            targetValue,
            deadline,
            scope: {
                type: scopeType,
                value: scopeType !== 'all' ? scopeValue : undefined,
            }
        });
        onClose();
    };
    
    return (
        <Modal title="Новая цель" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <Label htmlFor="title">Название цели</Label>
                    <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Например, 'Увеличить прибыль от футбола'" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="metric">Метрика</Label>
                        <Select id="metric" value={metric} onChange={e => setMetric(e.target.value as GoalMetric)}>
                            <option value={GoalMetric.Profit}>Прибыль (₽)</option>
                            <option value={GoalMetric.ROI}>ROI (%)</option>
                            <option value={GoalMetric.WinRate}>Процент побед (%)</option>
                            <option value={GoalMetric.BetCount}>Количество ставок</option>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="targetValue">Целевое значение</Label>
                        <Input id="targetValue" type="number" value={targetValue} onChange={e => setTargetValue(parseFloat(e.target.value))} required />
                    </div>
                </div>
                 <div>
                    <Label htmlFor="deadline">Дедлайн</Label>
                    <Input id="deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} required />
                </div>
                <div>
                    <Label>Область применения</Label>
                     <div className="grid grid-cols-2 gap-4">
                        <Select value={scopeType} onChange={e => { setScopeType(e.target.value as any); setScopeValue(''); }}>
                            <option value="all">Все ставки</option>
                            <option value="sport">По спорту</option>
                            <option value="betType">По типу ставки</option>
                            <option value="tag">По тегу</option>
                        </Select>
                        {scopeType === 'sport' && <Select value={scopeValue} onChange={e => setScopeValue(e.target.value)}><option value="">Выберите спорт</option>{SPORTS.map(s => <option key={s} value={s}>{s}</option>)}</Select>}
                        {scopeType === 'betType' && <Select value={scopeValue} onChange={e => setScopeValue(e.target.value)}><option value="">Выберите тип</option>{BET_TYPE_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</Select>}
                        {scopeType === 'tag' && <Input value={scopeValue} onChange={e => setScopeValue(e.target.value)} placeholder="Введите тег"/>}
                     </div>
                </div>
                <div className="flex justify-end pt-4 space-x-3">
                    <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
                    <Button type="submit">Создать цель</Button>
                </div>
            </form>
        </Modal>
    );
};

const GoalsPanel: React.FC = () => {
    const { goals, deleteGoal } = useBetContext();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    const activeGoals = goals.filter(g => g.status === GoalStatus.InProgress);
    const completedGoals = goals.filter(g => g.status !== GoalStatus.InProgress);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Мои Цели</h2>
                <Button onClick={() => setIsAddModalOpen(true)}>+ Новая цель</Button>
            </div>

            <section>
                <h3 className="text-lg font-semibold mb-4">Активные цели</h3>
                {activeGoals.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {activeGoals.map(goal => <GoalCard key={goal.id} goal={goal} onDelete={deleteGoal} />)}
                    </div>
                ) : (
                    <p className="text-center text-gray-500 py-10">У вас нет активных целей. Время поставить новую!</p>
                )}
            </section>
            
            <section>
                <h3 className="text-lg font-semibold mb-4">Архив целей</h3>
                 {completedGoals.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {completedGoals.map(goal => <GoalCard key={goal.id} goal={goal} onDelete={deleteGoal} />)}
                    </div>
                ) : (
                    <p className="text-center text-gray-500 py-10">Здесь будут отображаться ваши завершенные цели.</p>
                )}
            </section>

            {isAddModalOpen && <AddGoalModal onClose={() => setIsAddModalOpen(false)} />}
        </div>
    );
};

export default GoalsPanel;