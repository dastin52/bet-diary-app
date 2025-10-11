
import React, { useState } from 'react';
import { useBetContext } from '../contexts/BetContext';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Button from './ui/Button';
import Label from './ui/Label';

interface CashOutModalProps {
  onClose: () => void;
}

const CashOutModal: React.FC<CashOutModalProps> = ({ onClose }) => {
  const { bankroll, updateBankroll } = useBetContext();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const handleCashOut = (e: React.FormEvent) => {
    e.preventDefault();
    const cashOutAmount = parseFloat(amount);
    
    if (isNaN(cashOutAmount) || cashOutAmount <= 0) {
      setError('Пожалуйста, введите положительную сумму.');
      return;
    }
    if (cashOutAmount > bankroll) {
      setError('Сумма вывода не может превышать текущий банк.');
      return;
    }
    
    setError('');
    updateBankroll(bankroll - cashOutAmount);
    onClose();
  };

  return (
    <Modal title="Вывод средств (Кэшаут)" onClose={onClose}>
      <form onSubmit={handleCashOut} className="space-y-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Текущий банк:</p>
          <p className="font-medium text-gray-900 dark:text-white text-2xl">{bankroll.toFixed(2)} ₽</p>
        </div>
        <div>
          <Label htmlFor="cashOutAmount">Сумма для вывода</Label>
          <Input
            id="cashOutAmount"
            name="cashOutAmount"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </div>
        {error && <p className="text-red-400 text-sm -mt-2 mb-2">{error}</p>}
        <div className="flex justify-between items-center pt-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">Новый банк после вывода:</p>
            <p className="font-medium text-gray-900 dark:text-white text-lg">{(bankroll - (parseFloat(amount) || 0)).toFixed(2)} ₽</p>
        </div>
        <div className="flex justify-end pt-4 space-x-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit">Подтвердить вывод</Button>
        </div>
      </form>
    </Modal>
  );
};

export default CashOutModal;