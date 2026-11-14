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

export async function openReleasePage() {
  if (isTauri()) {
    try {
      await invoke('open_release_page');
    } catch (failure) {
      const message = String(failure);
      if (!message.includes('open_release_page') || !message.includes('not found')) {
        throw failure;
      }
      // A running desktop host can outlive a refresh of its shared studio assets.
      await invoke('open_browser');
      return false;
    }
  } else {
    window.open(
      'https://github.com/bayurifkialghifari/unlimitedclipper/releases',
      '_blank',
      'noopener,noreferrer',
    );
  }
  return true;
}
