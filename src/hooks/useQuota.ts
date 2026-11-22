import { useCallback, useEffect, useState } from 'react';
import { fetchQuota } from '../services/api';
import type { QuotaInfo } from '../types/plant';

export function useQuota() {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchQuota();
      setQuota(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateRemainingLocally = useCallback((remaining: number | null) => {
    if (remaining === null) return;
    setQuota((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        remaining,
        used: prev.dailyLimit !== null ? Math.max(0, prev.dailyLimit - remaining) : prev.used,
        exhausted: remaining <= 0,
        available: remaining > 0,
      };
    });
  }, []);

  const markExhaustedLocally = useCallback((resetAt?: string | null) => {
    setQuota((prev) => ({
      available: false,
      configured: prev?.configured ?? true,
      dailyLimit: prev?.dailyLimit ?? null,
      remaining: 0,
      used: prev?.dailyLimit ?? prev?.used ?? null,
      resetAt: resetAt ?? prev?.resetAt ?? null,
      exhausted: true,
      errorCode: 'QUOTA_EXHAUSTED',
    }));
  }, []);

  return {
    quota,
    loading,
    refresh,
    updateRemainingLocally,
    markExhaustedLocally,
  };
}
