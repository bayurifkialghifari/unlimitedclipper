import type { CaptionPreset, CaptionStyle, Word } from '../types';
import { TrashIcon } from '@phosphor-icons/react';
import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';

export function CaptionPresetPicker({
  presets,
  current,
  words,
  onChange,
  onRemove,
  disabled = false,
}: {
  presets: CaptionPreset[];
  current: CaptionStyle;
  words: Word[];
  onChange: (style: CaptionStyle) => void;
  onRemove?: (preset: CaptionPreset) => void;
  disabled?: boolean;
}) {
  const text = useText();
  const labels: Record<string, string> = {
    studio: text.captionStudio,
    impact: text.captionImpact,
    boxed: text.captionBoxed,
    word: text.captionSingle,
    kinetic: text.captionKinetic,
    clean: text.captionClean,
    documentary: text.captionDocumentary,
    headline: text.captionHeadline,
    punch: text.captionPunch,
    marker: text.captionMarker,
    blue_box: text.captionBlueBox,
    amber: text.captionAmber,
    teal: text.captionTeal,
    reveal: text.captionReveal,
    underline: text.captionUnderline,
    editorial: text.captionEditorial,
    soft: text.captionSoft,
    whisper: text.captionWhisper,
  };
  const compared: (keyof CaptionStyle)[] = [
    'preset',
    'font',
    'size',
    'color',
    'highlight_color',
    'outline',
    'outline_color',
    'words_per_line',
    'animation',
    'bold',
    'uppercase',
  ];
  return (
    <fieldset className={styles.presetFieldset}>
      <legend>{text.captionLooks}</legend>
      <div className={styles.captionPresets}>
        {presets.map((preset) => {
          const active = compared.every((key) => current[key] === preset.style[key]);
          const count =
            preset.style.preset === 'word' ? 1 : Math.min(preset.style.words_per_line, 4);
          const sample = words.length
            ? words.slice(0, count)
            : text.captionSample
                .split(' ')
                .slice(0, count)
                .map((word, index) => ({
                  id: String(index),
                  text: word,
                }));
          const label = preset.name ?? labels[preset.id] ?? preset.id;
          const activeWord = Math.floor((sample.length - 1) / 2);
          return (
            <div
              key={preset.id}
              className={styles.captionPresetTile}
              data-user-created={preset.user_created}
            >
              <button
                type="button"
                className={styles.captionPreset}
                aria-label={label}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onChange(preset.style)}
              >
                <span
                  className={styles.captionSample}
                  style={{
                    fontFamily: preset.style.font + ', sans-serif',
                    fontWeight: preset.style.bold ? 700 : 400,
                    textTransform: preset.style.uppercase ? 'uppercase' : 'none',
                    textShadow: '0 1px 2px ' + preset.style.outline_color,
                  }}
                  aria-hidden="true"
                >
                  {sample.map((word, index) => (
                    <span
                      key={word.id}
                      style={{
                        color:
                          index === activeWord && !['box', 'plain'].includes(preset.style.preset)
                            ? preset.style.highlight_color
                            : preset.style.color,
                        background:
                          index === activeWord && preset.style.preset === 'box'
                            ? preset.style.highlight_color
                            : 'transparent',
                        textDecoration:
                          preset.style.preset === 'underline' && index === activeWord
                            ? 'underline'
                            : 'none',
                        visibility:
                          preset.style.preset === 'reveal' && index > activeWord
                            ? 'hidden'
                            : 'visible',
                      }}
                    >
                      {word.text}
                    </span>
                  ))}
                </span>
                <span>{label}</span>
                {!words.length && <small>{text.captionSampleNote}</small>}
              </button>
              {preset.user_created && onRemove && (
                <button
                  type="button"
                  className={styles.captionPresetRemove}
                  aria-label={text.captionDeleteStyle + ': ' + label}
                  title={text.captionDeleteStyle + ': ' + label}
                  disabled={disabled}
                  onClick={() => onRemove(preset)}
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
