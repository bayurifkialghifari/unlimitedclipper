import { useId } from 'react';
import { GlobeIcon } from '@phosphor-icons/react';
import flagId from 'flag-icons/flags/4x3/id.svg';
import flagGb from 'flag-icons/flags/4x3/gb.svg';
import flagMy from 'flag-icons/flags/4x3/my.svg';
import flagSa from 'flag-icons/flags/4x3/sa.svg';
import flagCn from 'flag-icons/flags/4x3/cn.svg';
import flagIn from 'flag-icons/flags/4x3/in.svg';
import flagJp from 'flag-icons/flags/4x3/jp.svg';
import flagKr from 'flag-icons/flags/4x3/kr.svg';
import flagTh from 'flag-icons/flags/4x3/th.svg';
import flagVn from 'flag-icons/flags/4x3/vn.svg';
import flagPh from 'flag-icons/flags/4x3/ph.svg';
import flagPt from 'flag-icons/flags/4x3/pt.svg';
import flagEs from 'flag-icons/flags/4x3/es.svg';
import flagFr from 'flag-icons/flags/4x3/fr.svg';
import flagDe from 'flag-icons/flags/4x3/de.svg';
import flagIt from 'flag-icons/flags/4x3/it.svg';
import flagNl from 'flag-icons/flags/4x3/nl.svg';
import flagTr from 'flag-icons/flags/4x3/tr.svg';
import flagRu from 'flag-icons/flags/4x3/ru.svg';
import flagUa from 'flag-icons/flags/4x3/ua.svg';
import { languages } from '../lib/format';
import { useText } from '../lib/i18n';
import styles from '../styles/LanguageSelect.module.css';

const flagImages: Record<string, string> = {
  id: flagId,
  en: flagGb,
  ms: flagMy,
  ar: flagSa,
  zh: flagCn,
  hi: flagIn,
  ja: flagJp,
  ko: flagKr,
  th: flagTh,
  vi: flagVn,
  tl: flagPh,
  pt: flagPt,
  es: flagEs,
  fr: flagFr,
  de: flagDe,
  it: flagIt,
  nl: flagNl,
  tr: flagTr,
  ru: flagRu,
  uk: flagUa,
};

const flagEmoji: Record<string, string> = {
  id: '🇮🇩',
  en: '🇬🇧',
  ms: '🇲🇾',
  ar: '🇸🇦',
  zh: '🇨🇳',
  hi: '🇮🇳',
  ja: '🇯🇵',
  ko: '🇰🇷',
  th: '🇹🇭',
  vi: '🇻🇳',
  tl: '🇵🇭',
  pt: '🇵🇹',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  it: '🇮🇹',
  nl: '🇳🇱',
  tr: '🇹🇷',
  ru: '🇷🇺',
  uk: '🇺🇦',
};

export function LanguageSelect({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const text = useText();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>
        {flagImages[value] ? (
          <img className={styles.flag} src={flagImages[value]} alt="" aria-hidden="true" />
        ) : (
          <GlobeIcon className={styles.globe} aria-hidden="true" size={19} />
        )}
        <select
          id={id}
          className={styles.select}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {languages.map((code) => {
            const display = text.transcriptionLanguages[code];
            const prefix = code === value ? '' : code === 'auto' ? '🌐 ' : flagEmoji[code] + ' ';
            return (
              <option key={code} value={code}>
                {prefix + display}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
