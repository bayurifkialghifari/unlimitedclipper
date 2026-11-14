import type { CaptionPreset, CaptionStyle, Word } from '../types';
import { useText } from '../lib/i18n';
import styles from '../styles/Studio.module.css';

export function CaptionPresetPicker({
  presets,
  current,
  words,
  onChange,
}: {
  presets: CaptionPreset[];
  current: CaptionStyle;
  words: Word[];
  onChange: (style: CaptionStyle) => void;
}) {
  const text = useText();
  const labels: Record<string, string> = {
    studio: text.captionStudio,
    impact: text.captionImpact,
    boxed: text.captionBoxed,
    word: text.captionSingle,
    kinetic: text.captionKinetic,
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
          const sample = words.slice(0, preset.style.preset === 'word' ? 1 : 3);
          return (
            <button
              key={preset.id}
              type="button"
              className={styles.captionPreset}
              aria-pressed={active}
              onClick={() => onChange(preset.style)}
            >
              <span
                className={styles.captionSample}
                style={{
                  fontFamily: preset.style.font,
                  fontWeight: preset.style.bold ? 700 : 400,
                  textTransform: preset.style.uppercase ? 'uppercase' : 'none',
                }}
                aria-hidden="true"
              >
                {sample.map((word, index) => (
                  <span
                    key={word.id}
                    style={{
                      color:
                        index === 0 && preset.style.preset !== 'box'
                          ? preset.style.highlight_color
                          : preset.style.color,
                      background:
                        index === 0 && preset.style.preset === 'box'
                          ? preset.style.highlight_color
                          : 'transparent',
                    }}
                  >
                    {word.text}
                  </span>
                ))}
              </span>
              <span>{labels[preset.id] ?? preset.id}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
