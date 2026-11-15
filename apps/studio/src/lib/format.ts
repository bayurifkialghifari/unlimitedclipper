export function time(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return (
    Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (seconds % 60).toString().padStart(2, '0')
  );
}

export function bytes(value: number) {
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + ' GB';
  }
  return Math.round(value / 1_000_000) + ' MB';
}

export function date(milliseconds: number) {
  return new Intl.DateTimeFormat(document.documentElement.lang || 'id', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(milliseconds);
}

export const languages = [
  'auto',
  'id',
  'en',
  'ms',
  'ar',
  'zh',
  'hi',
  'ja',
  'ko',
  'th',
  'vi',
  'tl',
  'pt',
  'es',
  'fr',
  'de',
  'it',
  'nl',
  'tr',
  'ru',
  'uk',
] as const;
