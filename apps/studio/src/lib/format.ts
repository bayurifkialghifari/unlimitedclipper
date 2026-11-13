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
  ['auto', 'Auto-detect'],
  ['id', 'Indonesia'],
  ['en', 'English'],
  ['ms', 'Malay'],
  ['ar', 'Arabic'],
  ['zh', 'Chinese'],
  ['hi', 'Hindi'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['th', 'Thai'],
  ['vi', 'Vietnamese'],
  ['tl', 'Tagalog'],
  ['pt', 'Portuguese'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['nl', 'Dutch'],
  ['tr', 'Turkish'],
  ['ru', 'Russian'],
  ['uk', 'Ukrainian'],
];
