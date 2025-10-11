

import React, { createContext, useContext, ReactNode } from 'react';
import { useBets, UseBetsReturn } from '../hooks/useBets';

const BetContext = createContext<UseBetsReturn | undefined>(undefined);

export const BetProvider: React.FC<{ children: ReactNode; userKey: string; }> = ({ children, userKey }) => {
  const betState = useBets(userKey);
  return <BetContext.Provider value={betState}>{children}</BetContext.Provider>;
};

export const useBetContext = (): UseBetsReturn => {
  const context = useContext(BetContext);
  if (context === undefined) {
    throw new Error('useBetContext must be used within a BetProvider');
  }
  return context;
};
