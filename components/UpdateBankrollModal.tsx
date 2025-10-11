import React, { useState } from 'react';
import { useBetContext } from '../contexts/BetContext';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Button from './ui/Button';
import Label from './ui/Label';

interface UpdateBankrollModalProps {
  onClose: () => void;
}

const UpdateBankrollModal: React.FC<UpdateBankrollModalProps> = ({ onClose }) => {
  const { bankroll, updateBankroll } = useBetContext();
  const [newBankroll, setNewBankroll] = useState(String(bankroll));
  const [error, setError] = useState('');

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const newAmount = parseFloat(newBankroll);
    
    if (isNaN(newAmount) || newAmount < 0) {
      setError('Пожалуйста, введите положительную сумму.');
      return;
    }
    
    setError('');
    updateBankroll(newAmount);
    onClose();
  };

  return (
    <Modal title="Обновить банк" onClose={onClose}>
      <form onSubmit={handleUpdate} className="space-y-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Текущий банк:</p>
          <p className="font-medium text-gray-900 dark:text-white text-2xl">{bankroll.toFixed(2)} ₽</p>
        </div>
        <div>
          <Label htmlFor="newBankrollAmount">Новая сумма банка</Label>
          <Input
            id="newBankrollAmount"
            name="newBankrollAmount"
            type="number"
            step="0.01"
            placeholder="10000.00"
            value={newBankroll}
            onChange={(e) => setNewBankroll(e.target.value)}
            required
            autoFocus
          />
        </div>
        {error && <p className="text-red-400 text-sm -mt-2 mb-2">{error}</p>}
        <div className="flex justify-end pt-4 space-x-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit">Обновить</Button>
        </div>
      </form>
    </Modal>
  );
};

export default UpdateBankrollModal;