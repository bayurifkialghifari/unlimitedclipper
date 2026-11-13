import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Job } from '../types';

export function isAndroidHost() {
  return isTauri() && /Android/i.test(navigator.userAgent);
}

export function importAndroidVideo() {
  return invoke<Job | null>('android_import_video');
}

export function saveAndroidAsset(assetId: string) {
  return invoke<{ saved: boolean }>('android_save_asset', { assetId });
}
