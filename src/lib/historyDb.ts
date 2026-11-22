import type { StoredScanRecord } from '../types/plant';

const DB_NAME = 'plantscope_ai_db';
const DB_VERSION = 1;
const STORE_SCANS = 'scans';
const STORE_PREFS = 'preferences';

const LOCAL_PHOTO_PREF_KEY = 'save_local_thumbnail';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SCANS)) {
        const scanStore = db.createObjectStore(STORE_SCANS, { keyPath: 'id' });
        scanStore.createIndex('timestamp', 'timestamp', { unique: false });
        scanStore.createIndex('scientificName', 'scientificName', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

export async function saveScanRecord(record: StoredScanRecord): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SCANS, 'readwrite');
    tx.objectStore(STORE_SCANS).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to save scan record.'));
    };
  });
}

export async function getAllScanRecords(): Promise<StoredScanRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SCANS, 'readonly');
    const req = tx.objectStore(STORE_SCANS).getAll();
    req.onsuccess = () => {
      db.close();
      const rows = Array.isArray(req.result) ? (req.result as StoredScanRecord[]) : [];
      resolve(rows);
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error('Failed to load scan history.'));
    };
  });
}

export async function getScanRecordById(id: string): Promise<StoredScanRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SCANS, 'readonly');
    const req = tx.objectStore(STORE_SCANS).get(id);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as StoredScanRecord | undefined) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error('Failed to fetch scan record.'));
    };
  });
}

export async function deleteScanRecord(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SCANS, 'readwrite');
    tx.objectStore(STORE_SCANS).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to delete scan record.'));
    };
  });
}

export async function clearAllScanRecords(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SCANS, 'readwrite');
    tx.objectStore(STORE_SCANS).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to clear scan history.'));
    };
  });
}

export async function getSaveLocalPhotoPreference(): Promise<boolean> {
  try {
    const db = await openDatabase();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_PREFS, 'readonly');
      const req = tx.objectStore(STORE_PREFS).get(LOCAL_PHOTO_PREF_KEY);
      req.onsuccess = () => {
        db.close();
        resolve(Boolean((req.result as { value?: boolean } | undefined)?.value));
      };
      req.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

export async function setSaveLocalPhotoPreference(enabled: boolean): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PREFS, 'readwrite');
    tx.objectStore(STORE_PREFS).put({ key: LOCAL_PHOTO_PREF_KEY, value: enabled });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to store preference.'));
    };
  });
}
