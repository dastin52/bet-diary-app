import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import * as userStore from '../data/userStore';
import { useTelegram } from '../hooks/useTelegram';

const SESSION_STORAGE_KEY = 'betting_app_session';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_SECRET_CODE = 'SUPER_ADMIN_2024';

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password_hash: string) => Promise<void>;
  register: (email: string, password_hash: string, nickname: string, adminCode?: string, referralCode?: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  updateCurrentUser: (updatedData: Partial<User>) => void;
  isTelegramAuth: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const mockHash = (password: string) => `hashed_${password}`;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { initData, isTwa } = useTelegram();
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
        const session = localStorage.getItem(SESSION_STORAGE_KEY);
        return session ? JSON.parse(session) : null;
    } catch { return null; }
  });
  const [isTelegramAuth, setIsTelegramAuth] = useState(false);
  const isAdmin = currentUser?.email === ADMIN_EMAIL;
  
  useEffect(() => {
      const authTelegram = async () => {
          // Проверяем, что мы действительно в Telegram и initData не пустая
          if (isTwa && initData && initData !== 'EMPTY_STRING' && !currentUser) {
              try {
                  const response = await fetch('/api/auth/telegram', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ initData })
                  });
                  
                  if (response.ok) {
                      const user = await response.json();
                      setCurrentUser(user);
                      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
                      setIsTelegramAuth(true);
                  }
              } catch (e) { console.error("TWA Auth failed", e); }
          }
      };
      authTelegram();
  }, [isTwa, initData, currentUser]);

  const login = async (email: string, password_hash: string): Promise<void> => {
    const user = userStore.findUserBy(u => u.email === email);
    if (user && user.password_hash === mockHash(password_hash)) {
        if (user.status === 'blocked') throw new Error('Аккаунт заблокирован');
        setCurrentUser(user);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } else throw new Error('Неверные данные');
  };

  const register = async (email: string, password_hash: string, nickname: string, adminCode?: string, referralCode?: string): Promise<void> => {
    if (email === ADMIN_EMAIL && adminCode !== ADMIN_SECRET_CODE) throw new Error('Код админа неверен');
    if (userStore.findUserBy(u => u.email === email)) throw new Error('Email занят');
    
    const newUser: User = { 
        email, nickname, password_hash: mockHash(password_hash),
        registeredAt: new Date().toISOString(), referralCode: `REF${Date.now()}`,
        buttercups: 0, status: 'active', source: 'web'
    };
    userStore.addUser(newUser);
    setCurrentUser(newUser);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newUser));
  };
  
  const updateCurrentUser = (updatedData: Partial<User>) => {
      if (currentUser) {
          const updated = { ...currentUser, ...updatedData };
          userStore.updateUser(updated);
          setCurrentUser(updated);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
      }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setIsTelegramAuth(false);
  };
  
  return <AuthContext.Provider value={{ currentUser, login, register, logout, isAdmin, updateCurrentUser, isTelegramAuth }}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext must be used within AuthProvider');
  return context;
};