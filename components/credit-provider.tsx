'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth-provider';

export interface CreditState {
  creditsRemaining: number;
  creditLimit: number;
  creditsUsed: number;
  currentPlan: string;
  isAdmin: boolean;
  isLoading: boolean;
  refreshCredits: () => Promise<void>;
  fetchCredits: () => Promise<void>;
  consumeCreditOptimistic: (amount?: number) => void;
}

const CreditContext = createContext<CreditState | null>(null);

export function CreditProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [creditLimit, setCreditLimit] = useState(100);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [creditsRemaining, setCreditsRemaining] = useState(100);
  const [currentPlan, setCurrentPlan] = useState('free');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const applyCreditData = useCallback(
    (data: {
      limit?: number;
      used?: number;
      remaining?: number;
      isAdmin?: boolean;
      isUnlimited?: boolean;
      plan?: string;
    }) => {
      // Authoritative server-side determination from /api/profile/credits
      const isUserAdmin = Boolean(data.isAdmin);
      const isUnlimited = Boolean(data.isAdmin || data.isUnlimited);
      setIsAdmin(isUserAdmin);
      setCreditLimit(isUnlimited ? -1 : typeof data.limit === 'number' ? data.limit : 100);
      setCreditsUsed(typeof data.used === 'number' ? data.used : 0);
      setCreditsRemaining(isUnlimited ? -1 : typeof data.remaining === 'number' ? data.remaining : 100);
      if (data.plan) setCurrentPlan(data.plan);
    },
    []
  );

  const refreshCredits = useCallback(async () => {
    if (!user) {
      setCreditsRemaining(100);
      setCreditLimit(100);
      setCreditsUsed(0);
      setIsAdmin(false);
      return;
    }
    try {
      const res = await fetch('/api/profile/credits', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        applyCreditData(data);
      }
    } catch {
      // Non-critical
    }
  }, [user, applyCreditData]);

  // Alias fetchCredits to refreshCredits for full compatibility
  const fetchCredits = refreshCredits;

  useEffect(() => {
    let ignore = false;
    if (user) {
      fetch('/api/profile/credits', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && data) {
            applyCreditData(data);
          }
        })
        .catch(() => { })
        .finally(() => {
          if (!ignore) setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }

    return () => {
      ignore = true;
    };
  }, [user, applyCreditData]);

  const consumeCreditOptimistic = useCallback(
    (amount: number = 10) => {
      if (isAdmin) return; // Admin bypasses Codatron credit counter
      const dec = Math.max(1, amount);
      setCreditsRemaining((prev) => Math.max(0, prev - dec));
      setCreditsUsed((prev) => prev + dec);
    },
    [isAdmin]
  );

  return (
    <CreditContext.Provider
      value={{
        creditsRemaining,
        creditLimit,
        creditsUsed,
        currentPlan,
        isAdmin,
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
      creditsRemaining: 100,
      creditLimit: 100,
      creditsUsed: 0,
      currentPlan: 'free',
      isAdmin: false,
      isLoading: false,
      refreshCredits: async () => { },
      fetchCredits: async () => { },
      consumeCreditOptimistic: () => { },
    };
  }
  return ctx;
}
