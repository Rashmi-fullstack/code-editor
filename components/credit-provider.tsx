'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth-provider';

export interface CreditState {
  creditsRemaining: number;
  creditLimit: number;
  creditsUsed: number;
  isLoading: boolean;
  refreshCredits: () => Promise<void>;
  fetchCredits: () => Promise<void>;
  consumeCreditOptimistic: () => void;
}

const CreditContext = createContext<CreditState | null>(null);

export function CreditProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [creditLimit, setCreditLimit] = useState(4);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [creditsRemaining, setCreditsRemaining] = useState(4);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCredits = useCallback(async () => {
    if (!user) {
      setCreditsRemaining(4);
      setCreditLimit(4);
      setCreditsUsed(0);
      return;
    }
    try {
      const res = await fetch('/api/profile/credits', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCreditLimit(typeof data.limit === 'number' ? data.limit : 4);
        setCreditsUsed(typeof data.used === 'number' ? data.used : 0);
        setCreditsRemaining(typeof data.remaining === 'number' ? data.remaining : 4);
      }
    } catch {
      // Non-critical
    }
  }, [user]);

  // Alias fetchCredits to refreshCredits for full compatibility
  const fetchCredits = refreshCredits;

  useEffect(() => {
    let ignore = false;
    if (user) {
      fetch('/api/profile/credits', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && data) {
            setCreditLimit(typeof data.limit === 'number' ? data.limit : 4);
            setCreditsUsed(typeof data.used === 'number' ? data.used : 0);
            setCreditsRemaining(typeof data.remaining === 'number' ? data.remaining : 4);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!ignore) setIsLoading(false);
        });
    }

    return () => {
      ignore = true;
    };
  }, [user]);

  const consumeCreditOptimistic = useCallback(() => {
    setCreditsRemaining((prev) => Math.max(0, prev - 1));
    setCreditsUsed((prev) => prev + 1);
  }, []);

  return (
    <CreditContext.Provider
      value={{
        creditsRemaining,
        creditLimit,
        creditsUsed,
        isLoading,
        refreshCredits,
        fetchCredits,
        consumeCreditOptimistic,
      }}
    >
      {children}
    </CreditContext.Provider>
  );
}

export function useCredits() {
  const ctx = useContext(CreditContext);
  if (!ctx) {
    // Graceful fallback for components outside provider
    return {
      creditsRemaining: 4,
      creditLimit: 4,
      creditsUsed: 0,
      isLoading: false,
      refreshCredits: async () => {},
      fetchCredits: async () => {},
      consumeCreditOptimistic: () => {},
    };
  }
  return ctx;
}
