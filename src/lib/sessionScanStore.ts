import type { ScanResult } from '../types/plant';

export interface ActiveScanEntry {
  result: ScanResult;
  previewDataUrl: string | null;
  savePhotoLocally: boolean;
}

const activeScanMap = new Map<string, ActiveScanEntry>();

export function setActiveScan(entry: ActiveScanEntry): void {
  activeScanMap.set(entry.result.id, entry);
}

export function getActiveScan(id: string): ActiveScanEntry | null {
  return activeScanMap.get(id) ?? null;
}
