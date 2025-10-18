import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
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
  updateCurrentUser: (updatedData: Partial<User>) => void;
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
  
  // FIX: Add effect to sync auth state across browser tabs.
  // This effect will sync the currentUser state if another tab updates the user data
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      // Handle login/logout from other tabs
      if (event.key === SESSION_STORAGE_KEY) {
        if (event.newValue) {
          const newSessionUser = JSON.parse(event.newValue);
          // Update if the user is different or was null
          if (JSON.stringify(newSessionUser) !== JSON.stringify(currentUser)) {
            setCurrentUser(newSessionUser);
          }
        } else if (currentUser !== null) {
          // Logged out from another tab
          setCurrentUser(null);
        }
      }

      // Handle updates to user data (e.g., buttercups from a referral)
      if (event.key === 'betting_app_users' && currentUser && event.newValue) {
        const users = JSON.parse(event.newValue);
        const latestUser = users.find((u: User) => u.email === currentUser.email);
        if (latestUser && JSON.stringify(latestUser) !== JSON.stringify(currentUser)) {
          setCurrentUser(latestUser);
          // Also update the session storage for this tab to keep it in sync
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(latestUser));
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [currentUser]);


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
        } else {
            // FIX: Throw an error if the referral code is invalid.
            throw new Error("Неверный реферальный код.");
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
  
  // FIX: Add a function to update the current user's state.
  const updateCurrentUser = (updatedData: Partial<User>) => {
      if (currentUser) {
          const updatedUser = { ...currentUser, ...updatedData };
          userStore.updateUser(updatedUser);
          setCurrentUser(updatedUser);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedUser));
      }
  };


  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };
  
  const value = { currentUser, login, register, logout, isAdmin, updateCurrentUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
