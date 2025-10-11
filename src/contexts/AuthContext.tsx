import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User } from '../types';
import * as userStore from '../data/userStore';

const SESSION_STORAGE_KEY = 'betting_app_session';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_SECRET_CODE = 'SUPER_ADMIN_2024';
const REFERRAL_REWARD_FOR_REFERRER = 100; // Вознаграждение пригласившему
const REFERRAL_BONUS_FOR_INVITEE = 50;   // Бонус новому пользователю

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password_hash: string) => Promise<void>;
  register: (email: string, password_hash: string, nickname: string, adminCode?: string, referralCode?: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// A mock hashing function. In a real app, use a library like bcrypt on the server.
const mockHash = (password: string) => `hashed_${password}`;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
        const session = localStorage.getItem(SESSION_STORAGE_KEY);
        return session ? JSON.parse(session) : null;
    } catch {
        return null;
    }
  });
  
  const isAdmin = currentUser?.email === ADMIN_EMAIL;

  const login = async (email: string, password_hash: string): Promise<void> => {
    const user = userStore.findUserBy(u => u.email === email);
    // Note: This is an insecure password check for demonstration only.
    if (user && user.password_hash === mockHash(password_hash)) {
        if (user.status === 'blocked') {
            throw new Error('Этот аккаунт заблокирован.');
        }
        setCurrentUser(user);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } else {
        throw new Error('Неверные учетные данные');
    }
  };

  const register = async (email: string, password_hash: string, nickname: string, adminCode?: string, referralCode?: string): Promise<void> => {
    if (email === ADMIN_EMAIL && adminCode !== ADMIN_SECRET_CODE) {
        throw new Error('Неверный секретный код администратора.');
    }
      
    if (userStore.findUserBy(u => u.email === email)) {
      throw new Error('Пользователь с таким email уже существует');
    }
    if (userStore.findUserBy(u => u.nickname.toLowerCase() === nickname.toLowerCase())) {
        throw new Error('Этот никнейм уже занят');
    }
    if (nickname.length < 3) {
        throw new Error('Никнейм должен быть не менее 3 символов');
    }

    let initialButtercups = 0;
    // Handle referral logic
    if (referralCode) {
        const referrer = userStore.findUserBy(u => u.referralCode.toLowerCase() === referralCode.toLowerCase());
        if (referrer) {
            const updatedReferrer = {
                ...referrer,
                buttercups: (referrer.buttercups || 0) + REFERRAL_REWARD_FOR_REFERRER,
            };
            userStore.updateUser(updatedReferrer);
            initialButtercups = REFERRAL_BONUS_FOR_INVITEE;
        }
    }

    const newUser: User = { 
        email, 
        nickname,
        password_hash: mockHash(password_hash),
        registeredAt: new Date().toISOString(),
        referralCode: `${nickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
        buttercups: initialButtercups,
        status: 'active',
    };
    
    userStore.addUser(newUser);
    setCurrentUser(newUser);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newUser));
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };
  
  const value = { currentUser, login, register, logout, isAdmin };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
