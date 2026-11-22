import { useCallback, useEffect, useState } from 'react';
import {
  clearAllScanRecords,
  deleteScanRecord,
  getAllScanRecords,
  saveScanRecord,
} from '../lib/historyDb';
import type { StoredScanRecord } from '../types/plant';

export function useScanHistory() {
  const [records, setRecords] = useState<StoredScanRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await getAllScanRecords();
      setRecords(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load local scan history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRecord = useCallback(async (record: StoredScanRecord) => {
    await saveScanRecord(record);
    setRecords((prev) => {
      const next = prev.filter((item) => item.id !== record.id);
      return [record, ...next];
    });
  }, []);

  const removeRecord = useCallback(async (id: string) => {
    await deleteScanRecord(id);
    setRecords((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearHistory = useCallback(async () => {
    await clearAllScanRecords();
    setRecords([]);
  }, []);

  return {
    records,
    loading,
    error,
    reload: load,
    saveRecord,
    removeRecord,
    clearHistory,
  };
}
