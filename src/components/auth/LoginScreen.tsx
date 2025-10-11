import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import Input from '../ui/Input';
import Label from '../ui/Label';
import Button from '../ui/Button';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] =useState('');
  const [adminCode, setAdminCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useAuthContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
        if (isLoginMode) {
            await login(email, password);
        } else {
            if (password.length < 6) {
                throw new Error("Пароль должен быть не менее 6 символов");
            }
            await register(email, password, nickname, adminCode, referralCode);
        }
        if (onLoginSuccess) {
            onLoginSuccess();
        }
    } catch (err: any) {
        setError(err.message || 'Произошла ошибка');
    } finally {
        setIsLoading(false);
    }
  };

  const isAdminRegistration = !isLoginMode && email.toLowerCase() === 'admin@example.com';

  return (
    <div className="w-full">
        <p className="text-center text-gray-500 dark:text-gray-400 mb-6">{isLoginMode ? 'Войдите в свой аккаунт для продолжения' : 'Создайте новый аккаунт'}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
            {!isLoginMode && (
                 <div>
                    <Label htmlFor="nickname">Никнейм</Label>
                    <Input
                        type="text"
                        id="nickname"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        required
                        placeholder="Ваш игровой ник"
                    />
                </div>
            )}
            <div>
                <Label htmlFor="email">Email</Label>
                <Input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                />
            </div>
            <div>
                <Label htmlFor="password">Пароль</Label>
                <Input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                />
            </div>

            {!isLoginMode && !isAdminRegistration && (
                 <div>
                    <Label htmlFor="referralCode">Реферальный код (необязательно)</Label>
                    <Input
                        type="text"
                        id="referralCode"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value)}
                        placeholder="Код пригласившего друга"
                    />
                </div>
            )}

            {isAdminRegistration && (
                <div>
                    <Label htmlFor="adminCode">Секретный код администратора</Label>
                    <Input
                        type="password"
                        id="adminCode"
                        value={adminCode}
                        onChange={(e) => setAdminCode(e.target.value)}
                        required
                        placeholder="Введите секретный код"
                    />
                </div>
            )}
            
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <div className="pt-2">
                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Загрузка...' : (isLoginMode ? 'Войти' : 'Зарегистрироваться')}
                </Button>
            </div>
        </form>
        <div className="mt-4 text-center">
            <button
                onClick={() => {
                    setIsLoginMode(!isLoginMode);
                    setError(null);
                }}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
            >
                {isLoginMode ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
            </button>
        </div>
    </div>
  );
};

export default LoginScreen;