
import React, { useState, useEffect } from 'react';
import { useBetContext } from '../contexts/BetContext';
import { Bet, BetLeg, BetStatus, BetType } from '../types';
import { SPORTS, BOOKMAKERS, BET_STATUS_OPTIONS, BET_TYPE_OPTIONS, MARKETS_BY_SPORT } from '../constants';
import { calculateRiskManagedStake } from '../ml/mockModel';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Select from './ui/Select';
import Button from './ui/Button';
import Label from './ui/Label';

interface AddBetModalProps {
  onClose: () => void;
  betToEdit?: Bet | null;
}

const defaultLeg: BetLeg = { homeTeam: '', awayTeam: '', market: '' };

const defaultFormData: Omit<Bet, 'id' | 'createdAt' | 'event'> = {
    sport: SPORTS[0],
    bookmaker: BOOKMAKERS[0],
    betType: BetType.Single,
    stake: 10,
    odds: 1.5,
    status: BetStatus.Pending,
    profit: 0,
    legs: [{...defaultLeg}],
    tags: [],
};

const AddBetModal: React.FC<AddBetModalProps> = ({ onClose, betToEdit }) => {
  const { addBet, updateBet, bankroll } = useBetContext();
  const isEditMode = Boolean(betToEdit);
  
  const [formData, setFormData] = useState(defaultFormData);
  const [tagInput, setTagInput] = useState('');
  const [recommendedStakeInfo, setRecommendedStakeInfo] = useState<{ stake: number; percentage: number } | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  
  useEffect(() => {
    if (isEditMode && betToEdit) {
      const { tags, ...rest } = betToEdit;
      setFormData({
        ...defaultFormData,
        ...rest,
        legs: betToEdit.legs && betToEdit.legs.length > 0 ? betToEdit.legs : [{...defaultLeg}],
      });
      setTagInput(tags ? tags.join(', ') : '');
    } else {
        setFormData(defaultFormData);
        setTagInput('');
    }
  }, [betToEdit, isEditMode]);


  useEffect(() => {
    if (formData.odds > 1 && bankroll > 0) {
        const stakeSuggestion = calculateRiskManagedStake(bankroll, formData.odds);
        setRecommendedStakeInfo(stakeSuggestion);
    } else {
        setRecommendedStakeInfo(null);
    }
  }, [formData.odds, bankroll]);

  const clearErrors = () => {
    if (Object.keys(errors).length > 0) {
        setErrors({});
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    clearErrors();
    const { name, value } = e.target;
    const isNumeric = ['stake', 'odds', 'profit'].includes(name);

    if (name === 'betType') {
        const newBetType = value as BetType;
        setFormData(prev => ({
            ...prev,
            betType: newBetType,
            legs: newBetType === BetType.Single ? [prev.legs[0] || {...defaultLeg}] : prev.legs,
        }));
        return;
    }

    if (name === 'sport') {
        setFormData(prev => ({
            ...prev,
            sport: value,
            legs: [{...defaultLeg}], // Reset legs as teams/markets change
        }));
        return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: isNumeric ? parseFloat(value) || 0 : value,
    }));
  };

  const handleLegChange = (index: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    clearErrors();
    const { name, value } = e.target;
    const newLegs = [...formData.legs];
    newLegs[index] = { ...newLegs[index], [name as keyof BetLeg]: value };
    setFormData(prev => ({ ...prev, legs: newLegs }));
  };

  const handleAddLeg = () => {
    setFormData(prev => ({...prev, legs: [...prev.legs, {...defaultLeg}]}));
  };

  const handleRemoveLeg = (index: number) => {
    if (formData.legs.length <= 1) return; // Cannot remove the last leg
    setFormData(prev => ({...prev, legs: prev.legs.filter((_, i) => i !== index)}));
  };
  
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (formData.stake <= 0) newErrors.stake = 'Сумма должна быть больше 0.';
    if (formData.odds <= 1) newErrors.odds = 'Коэф. должен быть больше 1.';

    const legsAreValid = formData.legs.every(leg => 
        leg.homeTeam.trim() !== '' && 
        leg.awayTeam.trim() !== '' && 
        leg.market.trim() !== '' && 
        leg.homeTeam.trim().toLowerCase() !== leg.awayTeam.trim().toLowerCase()
    );
    if (!legsAreValid) newErrors.legs = 'Заполните все поля событий и убедитесь, что участники не совпадают.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
        const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
        const submissionData = {
            ...formData,
            tags,
            legs: formData.betType === BetType.System ? [] : formData.legs,
        };

        if (isEditMode && betToEdit) {
            updateBet(betToEdit.id, submissionData);
        } else {
            const betToAdd: Omit<Bet, 'id' | 'createdAt' | 'event' | 'profit'> & { profit?: number } = { ...submissionData };
            if(formData.status !== BetStatus.CashedOut) {
                delete betToAdd.profit;
            }
            addBet(betToAdd);
        }
        onClose();
    }
  };
  
  const handleUseRecommended = () => {
      if (recommendedStakeInfo && recommendedStakeInfo.stake > 0) {
          setFormData(prev => ({ ...prev, stake: parseFloat(recommendedStakeInfo.stake.toFixed(2)) }));
      }
  }
  
  const availableMarkets = MARKETS_BY_SPORT[formData.sport] || [];
  const isIndividualSport = ['Теннис', 'Бокс', 'ММА'].includes(formData.sport);
  const team1Label = isIndividualSport ? 'Участник 1' : 'Команда 1';
  const team2Label = isIndividualSport ? 'Участник 2' : 'Команда 2';

  return (
    <Modal title={isEditMode ? "Редактировать ставку" : "Добавить новую ставку"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <Label htmlFor="sport">Вид спорта</Label>
                <Select id="sport" name="sport" value={formData.sport} onChange={handleChange} required>
                    {SPORTS.map(sport => <option key={sport} value={sport}>{sport}</option>)}
                </Select>
            </div>
            <div>
                <Label htmlFor="bookmaker">Букмекер</Label>
                <Select id="bookmaker" name="bookmaker" value={formData.bookmaker} onChange={handleChange} required>
                    {BOOKMAKERS.map(bookie => <option key={bookie} value={bookie}>{bookie}</option>)}
                </Select>
            </div>
        </div>
        
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
             <Label>{formData.betType === BetType.Parlay ? 'События в экспрессе' : 'Событие'}</Label>
            {formData.betType !== BetType.System ? (
            <div className="space-y-3">
                {formData.legs.map((leg, index) => {
                    return (
                        <div key={index} className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg space-y-2 relative">
                            {formData.betType === BetType.Parlay && (
                                <span className="absolute -top-2 -left-2 bg-indigo-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{index + 1}</span>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <Label htmlFor={`homeTeam-${index}`} className="text-xs">{team1Label}</Label>
                                    <Input id={`homeTeam-${index}`} name="homeTeam" type="text" placeholder="Название команды/участника" value={leg.homeTeam} onChange={e => handleLegChange(index, e)} required />
                                </div>
                                <div>
                                    <Label htmlFor={`awayTeam-${index}`} className="text-xs">{team2Label}</Label>
                                     <Input id={`awayTeam-${index}`} name="awayTeam" type="text" placeholder="Название команды/участника" value={leg.awayTeam} onChange={e => handleLegChange(index, e)} required />
                                </div>
                            </div>
                             <div>
                                <Label htmlFor={`market-${index}`} className="text-xs">Исход</Label>
                                <Select id={`market-${index}`} name="market" value={leg.market} onChange={e => handleLegChange(index, e)} required>
                                    <option value="">Выберите исход...</option>
                                    {availableMarkets.map(market => <option key={market} value={market}>{market}</option>)}
                                </Select>
                            </div>
                            {formData.betType === BetType.Parlay && formData.legs.length > 1 && (
                                <button type="button" onClick={() => handleRemoveLeg(index)} className="absolute -top-2 -right-2 text-red-400 hover:text-red-300 bg-gray-300 dark:bg-gray-800 rounded-full p-0.5">
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                                </button>
                            )}
                        </div>
                    )
                })}
                {formData.betType === BetType.Parlay && (
                    <Button type="button" variant="secondary" onClick={handleAddLeg} className="w-full text-xs py-1.5">Добавить событие</Button>
                )}
            </div>
            ) : (
                 <p className="text-sm text-gray-500 dark:text-gray-400 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg">Добавление системных ставок пока не поддерживается в детальном режиме. Пожалуйста, введите общее описание в заметках.</p>
            )}
            {errors.legs && <p className="text-red-400 text-sm text-center mt-2">{errors.legs}</p>}
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-3 -mt-1">Основные параметры</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <Label htmlFor="stake">Сумма ставки</Label>
                    <Input id="stake" name="stake" type="number" step="0.01" min="0.01" value={formData.stake} onChange={handleChange} required />
                    {errors.stake && <p className="text-red-400 text-xs mt-1">{errors.stake}</p>}
                </div>
                <div>
                    <Label htmlFor="odds">Коэффициент</Label>
                    <Input id="odds" name="odds" type="number" step="0.01" min="1.01" value={formData.odds} onChange={handleChange} required />
                    {errors.odds && <p className="text-red-400 text-xs mt-1">{errors.odds}</p>}
                </div>
                 <div>
                    <Label htmlFor="betType">Тип ставки</Label>
                    <Select id="betType" name="betType" value={formData.betType} onChange={handleChange} required>
                        {BET_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </Select>
                </div>
            </div>
        </div>
        
        <div>
            <Label htmlFor="tags">Теги (через запятую)</Label>
            <Input id="tags" name="tags" type="text" placeholder="Например: value_bet, стратегия_1" value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
        </div>


        <div className="border-t border-dashed border-gray-300 dark:border-gray-600 my-4 pt-4">
            <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-2">Анализ и Рекомендация</h4>
            <div className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Рекомендуемая ставка (риск-менеджмент):</span>
                    {recommendedStakeInfo && recommendedStakeInfo.stake > 0 ? (
                        <div className="flex items-center space-x-2">
                             <span className="font-bold text-green-600 dark:text-green-400">{recommendedStakeInfo.stake.toFixed(2)} ₽ ({recommendedStakeInfo.percentage.toFixed(1)}%)</span>
                             <button type="button" onClick={handleUseRecommended} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded">Использовать</button>
                        </div>
                    ) : (
                        <span className="font-bold text-yellow-600 dark:text-yellow-400">Не ставить</span>
                    )}
                </div>
            </div>
        </div>

        <div>
            <Label htmlFor="status">Статус</Label>
            <Select id="status" name="status" value={formData.status} onChange={handleChange} required>
                {BET_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </Select>
        </div>
        {formData.status === BetStatus.CashedOut && (
            <div>
                <Label htmlFor="profit">Прибыль/убыток по кэшауту</Label>
                <Input id="profit" name="profit" type="number" step="0.01" placeholder="Введите итоговый П/У" value={formData.profit} onChange={handleChange} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Введите отрицательное значение для убытка.</p>
            </div>
        )}
        <div className="flex justify-end pt-4 space-x-3">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit">{isEditMode ? 'Обновить' : 'Сохранить'}</Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddBetModal;