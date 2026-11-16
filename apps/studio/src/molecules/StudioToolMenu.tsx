import {
  BezierCurveIcon,
  CropIcon,
  FilmSlateIcon,
  FilmStripIcon,
  SlidersHorizontalIcon,
  StampIcon,
  SubtitlesIcon,
  TextTIcon,
  WaveformIcon,
} from '@phosphor-icons/react';
import { useText } from '../lib/i18n';
import styles from '../styles/Editor.module.css';

const toolIds = [
  'timeline',
  'broll',
  'captions',
  'crop',
  'title',
  'motion',
  'audio',
  'style',
  'branding',
] as const;

export type StudioTool = (typeof toolIds)[number];

export function isStudioTool(value: string | null): value is StudioTool {
  return toolIds.some((tool) => tool === value);
}

export function StudioToolMenu({
  active,
  onSelect,
}: {
  active: StudioTool;
  onSelect: (tool: StudioTool) => void;
}) {
  const text = useText();
  const tools = [
    { id: 'timeline', label: text.sourceTools, shortLabel: text.scenes, icon: FilmStripIcon },
    { id: 'broll', label: text.brollTool, shortLabel: text.brollTool, icon: FilmSlateIcon },
    { id: 'captions', label: text.captions, shortLabel: text.captions, icon: SubtitlesIcon },
    { id: 'crop', label: text.crop, shortLabel: text.crop, icon: CropIcon },
    { id: 'title', label: text.title, shortLabel: text.title, icon: TextTIcon },
    { id: 'motion', label: text.motionTools, shortLabel: text.motionTools, icon: BezierCurveIcon },
    { id: 'audio', label: text.audioLayers, shortLabel: text.toolAudio, icon: WaveformIcon },
    {
      id: 'style',
      label: text.effects,
      shortLabel: text.effects,
      icon: SlidersHorizontalIcon,
    },
    { id: 'branding', label: text.branding, shortLabel: text.branding, icon: StampIcon },
  ] satisfies { id: StudioTool; label: string; shortLabel: string; icon: typeof FilmStripIcon }[];

  return (
    <div className={styles.toolMenuScroll}>
      <div className={styles.toolMenu} role="tablist" aria-label={text.editorTools}>
        {tools.map((tool, index) => (
          <button
            key={tool.id}
            id={'tab-' + tool.id}
            type="button"
            role="tab"
            aria-label={tool.label}
            aria-selected={active === tool.id}
            aria-controls={'panel-' + tool.id}
            tabIndex={active === tool.id ? 0 : -1}
            onClick={() => onSelect(tool.id)}
            onKeyDown={(event) => {
              let nextIndex = index;
              if (event.key === 'ArrowRight') {
                nextIndex = (index + 1) % tools.length;
              } else if (event.key === 'ArrowLeft') {
                nextIndex = (index - 1 + tools.length) % tools.length;
              } else if (event.key === 'Home') {
                nextIndex = 0;
              } else if (event.key === 'End') {
                nextIndex = tools.length - 1;
              } else {
                return;
              }
              event.preventDefault();
              onSelect(tools[nextIndex].id);
              window.document.getElementById('tab-' + tools[nextIndex].id)?.focus();
            }}
          >
            <tool.icon aria-hidden="true" />
            <span className={styles.toolLabel}>{tool.shortLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
