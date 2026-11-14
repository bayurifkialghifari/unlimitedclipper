import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Select, Segmented, Toggle } from '@unlimitedclipper/ui';
import { ScissorsIcon, CropIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { api, uploadFile } from '../lib/api';
import { useEditor } from '../lib/editor-store';
import { useText } from '../lib/i18n';
import { isAndroidHost } from '../lib/native';
import { languages } from '../lib/format';
import { CaptionPresetPicker } from '../molecules/CaptionPresetPicker';
import { QueryState } from '../molecules/QueryState';
import { CaptionRefinement } from './CaptionRefinement';
import { EditorialPanel } from './EditorialPanel';
import { TimelineEditor } from './TimelineEditor';
import type { CropRect, Layout, Project } from '../types';
import styles from '../styles/Studio.module.css';

const clamp = (value: number, maximum = 1) => Math.max(0, Math.min(maximum, value));
const fonts = ['Noto Sans', 'DM Sans', 'Oswald'];

export function Inspector({
  project,
  onManualClip,
}: {
  project?: Project;
  onManualClip: () => void;
}) {
  const text = useText();
  const [tab, setTab] = useState('options');
  const [selectedCount, setCount] = useState<number | null>(null);
  const [selectedDuration, setDuration] = useState<string | null>(null);
  const [selectedLanguage, setLanguage] = useState<string | null>(null);
  const [focus, setFocus] = useState('');
  const [minimumScore, setMinimumScore] = useState('85');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const draft = useEditor((state) => state.draft);
  const dirty = useEditor((state) => state.dirty);
  const saving = useEditor((state) => state.saving);
  const selected = useEditor((state) => state.selectedWords);
  const playhead = useEditor((state) => state.playhead);
  const models = useQuery({ queryKey: ['models'], queryFn: api.models });
  const preferences = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const presets = useQuery({
    queryKey: ['caption-presets'],
    queryFn: api.captionPresets,
    enabled: tab === 'captions',
  });
  const count = selectedCount ?? preferences.data?.clip_count ?? 4;
  const duration = selectedDuration ?? String(preferences.data?.clip_duration_ms ?? 0);
  const language = selectedLanguage ?? preferences.data?.transcription_language ?? 'auto';
  const client = useQueryClient();
  const change = useEditor((state) => state.change);
  const document = draft?.document;
  const activeJobs = jobs.data?.filter((job) =>
    ['queued', 'running', 'cancelling'].includes(job.status),
  );
  const generating = Boolean(
    activeJobs?.some((job) => job.kind === 'generate' && job.project_id === project?.id),
  );
  const editing = Boolean(
    activeJobs?.some(
      (job) => ['title', 'track', 'captions'].includes(job.kind) && job.clip_id === draft?.id,
    ),
  );
  const selectionReady = Boolean(
    models.data?.some((model) => model.id === 'qwen3-4b' && model.ready),
  );
  const speechReady = Boolean(
    models.data?.some(
      (model) => model.id === (preferences.data?.speech_model ?? 'whisper-small') && model.ready,
    ),
  );
  const tabs = [
    ['options', text.options],
    ['captions', text.captions],
    ['crop', text.crop],
    ['title', text.title],
    ['branding', text.branding],
    ['timeline', text.timelineSegments],
  ];

  async function action(operation: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await operation();
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  function cropChange(
    target: 'crop' | 'gameplay_crop' | 'facecam_crop',
    key: keyof CropRect,
    value: number,
  ) {
    change((next) => {
      const crop = next[target];
      crop[key] = key === 'width' || key === 'height' ? Math.max(0.02, clamp(value)) : clamp(value);
      crop.x = clamp(crop.x, 1 - crop.width);
      crop.y = clamp(crop.y, 1 - crop.height);
      if (target === 'crop') {
        next.keyframes = next.keyframes.map((keyframe) => ({
          ...keyframe,
          x: clamp(keyframe.x, 1 - crop.width),
          y: clamp(keyframe.y, 1 - crop.height),
        }));
      }
    });
  }

  function cropFields(target: 'crop' | 'gameplay_crop' | 'facecam_crop') {
    if (!document) {
      return null;
    }
    return (
      <div className={styles.twoColumns}>
        {(['x', 'y', 'width', 'height'] as const).map((key) => (
          <Field
            key={key}
            label={
              { x: text.left, y: text.top, width: text.width, height: text.height }[key] + ' (%)'
            }
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={Number((document[target][key] * 100).toFixed(1))}
            onChange={(event) => cropChange(target, key, Number(event.target.value) / 100)}
          />
        ))}
      </div>
    );
  }

  function updateBoundary(key: 'start_ms' | 'end_ms', value: number) {
    if (!project) {
      return;
    }
    change((next) => {
      const oldStart = next.start_ms;
      next[key] =
        key === 'start_ms'
          ? clamp(value, next.end_ms - 100)
          : Math.max(next.start_ms + 100, Math.min(project.duration_ms, value));
      const overrides = new Map(next.words.map((word) => [word.id, word]));
      const sourceWords = project.words.filter(
        (word) => word.end_ms > next.start_ms && word.start_ms < next.end_ms,
      );
      const originalIds = new Set(project.words.map((word) => word.id));
      const manualWords = next.words
        .filter((word) => !originalIds.has(word.id))
        .map((word) => ({
          ...word,
          start_ms: word.start_ms + oldStart - next.start_ms,
          end_ms: word.end_ms + oldStart - next.start_ms,
        }))
        .filter((word) => word.start_ms >= 0 && word.end_ms <= next.end_ms - next.start_ms);
      next.words = [
        ...sourceWords.map((word) => ({
          ...word,
          ...overrides.get(word.id),
          text: overrides.get(word.id)?.text ?? word.text,
          emphasis: overrides.get(word.id)?.emphasis ?? word.emphasis,
          color: overrides.get(word.id)?.color ?? word.color,
          start_ms: Math.max(
            0,
            (overrides.get(word.id)?.start_ms === undefined
              ? word.start_ms
              : oldStart + overrides.get(word.id)!.start_ms) - next.start_ms,
          ),
          end_ms: Math.min(
            next.end_ms - next.start_ms,
            (overrides.get(word.id)?.end_ms === undefined
              ? word.end_ms
              : oldStart + overrides.get(word.id)!.end_ms) - next.start_ms,
          ),
        })),
        ...manualWords,
      ]
        .filter((word) => word.end_ms > word.start_ms)
        .sort((a, b) => a.start_ms - b.start_ms);
      next.keyframes = next.keyframes
        .map((key) => ({
          ...key,
          time_ms: key.time_ms + oldStart - next.start_ms,
        }))
        .filter((key) => key.time_ms >= 0 && key.time_ms <= next.end_ms - next.start_ms);
    });
  }

  function setLayout(layout: Layout) {
    change((next) => {
      next.layout = layout;
      if (project) {
        const ratio = layout === 'square' ? 1 : layout === 'landscape' ? 16 / 9 : 9 / 16;
        const sourceRatio = project.width / project.height;
        const width = Math.min(1, ratio / sourceRatio);
        const height = Math.min(1, sourceRatio / ratio);
        next.crop = { width, height, x: (1 - width) / 2, y: (1 - height) / 2 };
        next.keyframes = [];
      }
    });
  }

  const selectedWord = document?.words.find((word) => selected.includes(word.id));
  return (
    <aside className={styles.inspector}>
      <div className={styles.inspectorTabs} role="tablist" aria-label={text.options}>
        {tabs.map(([value, label], index) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={'panel-' + value}
            id={'tab-' + value}
            className={styles.inspectorTab}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                const next =
                  (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                setTab(tabs[next][0]);
                window.document.getElementById('tab-' + tabs[next][0])?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={styles.inspectorBody}
        role="tabpanel"
        id={'panel-' + tab}
        aria-labelledby={'tab-' + tab}
      >
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        {tab === 'options' && (
          <>
            <h2>{text.options}</h2>
            <Field
              label={text.clipCount}
              type="number"
              min={1}
              max={1000}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
            <Segmented
              label={text.duration}
              value={duration}
              onChange={setDuration}
              options={[
                { value: '15000', label: '15s' },
                { value: '30000', label: '30s' },
                { value: '60000', label: '60s' },
                { value: '0', label: text.automatic },
              ]}
            />
            <Select label={text.language} value={language} onChange={setLanguage}>
              {languages.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Field
              label={text.clipFocus}
              value={focus}
              maxLength={400}
              placeholder={text.clipFocusHint}
              onChange={(event) => setFocus(event.target.value)}
            />
            <Select label={text.interestFilter} value={minimumScore} onChange={setMinimumScore}>
              <option value="85">{text.interestStrict}</option>
              <option value="70">{text.interestBalanced}</option>
              <option value="50">{text.interestBroad}</option>
            </Select>
            <p className={styles.hint}>{text.clipSelectionDetail}</p>
            <Button
              variant="primary"
              icon={<ScissorsIcon />}
              disabled={
                isAndroidHost() ||
                !project ||
                pending ||
                generating ||
                !selectionReady ||
                (!speechReady && !project.words.length)
              }
              onClick={() =>
                void action(() =>
                  api.generate(
                    project!.id,
                    count,
                    Number(duration),
                    language,
                    focus,
                    Number(minimumScore),
                  ),
                )
              }
            >
              {generating ? text.running : text.generate}
            </Button>
            {(!selectionReady || !speechReady) && (
              <p className={styles.hint}>{text.modelsRequired}</p>
            )}
            <Button disabled={!project || pending} onClick={onManualClip}>
              {text.manualClip}
            </Button>
            {document && (
              <>
                <hr className={styles.separator} />
                <EditorialPanel key={draft!.id} />
                <Field
                  label={text.name}
                  value={draft!.name}
                  maxLength={150}
                  onChange={(event) => useEditor.getState().rename(event.target.value)}
                />
                <div className={styles.twoColumns}>
                  <Field
                    label={text.start + ' (s)'}
                    type="number"
                    min={0}
                    step={0.1}
                    value={document.start_ms / 1000}
                    disabled={
                      (document.segments?.length ?? 1) > 1 ||
                      Boolean(document.visual_layers?.length || document.audio_layers?.length)
                    }
                    onChange={(event) =>
                      updateBoundary('start_ms', Number(event.target.value) * 1000)
                    }
                  />
                  <Field
                    label={text.end + ' (s)'}
                    type="number"
                    step={0.1}
                    max={(project?.duration_ms ?? 0) / 1000}
                    value={document.end_ms / 1000}
                    disabled={
                      (document.segments?.length ?? 1) > 1 ||
                      Boolean(document.visual_layers?.length || document.audio_layers?.length)
                    }
                    onChange={(event) =>
                      updateBoundary('end_ms', Number(event.target.value) * 1000)
                    }
                  />
                </div>
                <Select
                  label={text.format}
                  value={document.layout}
                  onChange={(value) => setLayout(value as Layout)}
                >
                  {(['portrait', 'square', 'landscape', 'contain', 'blur', 'gaming'] as const).map(
                    (layout) => (
                      <option key={layout} value={layout}>
                        {text[layout]}
                      </option>
                    ),
                  )}
                </Select>
                {((document.segments?.length ?? 1) > 1 ||
                  Boolean(document.visual_layers?.length || document.audio_layers?.length)) && (
                  <p className={styles.hint}>{text.timelineBoundaryHint}</p>
                )}
                <Segmented
                  label={text.resolution}
                  value={String(document.resolution)}
                  onChange={(value) =>
                    change((next) => {
                      next.resolution = Number(value);
                    })
                  }
                  options={[720, 1080, 1440, 2160].map((value) => ({
                    value: String(value),
                    label: value + 'p',
                  }))}
                />
              </>
            )}
          </>
        )}
        {tab !== 'options' && !document && <p className={styles.hint}>{text.noClipsDetail}</p>}
        {tab === 'captions' && document && (
          <>
            <h2>{text.captions}</h2>
            <QueryState
              pending={presets.isPending}
              error={presets.error}
              retry={() => void presets.refetch()}
            />
            {presets.data && (
              <CaptionPresetPicker
                presets={presets.data}
                current={document.captions}
                words={document.words}
                onChange={(style) =>
                  change((next) => {
                    next.captions = {
                      ...style,
                      enabled: next.captions.enabled,
                      position_y: next.captions.position_y,
                    };
                  })
                }
              />
            )}
            <Toggle
              label={text.enabled}
              checked={document.captions.enabled}
              onChange={(value) =>
                change((next) => {
                  next.captions.enabled = value;
                })
              }
            />
            <Select
              label={text.preset}
              value={document.captions.preset}
              onChange={(value) =>
                change((next) => {
                  next.captions.preset = value;
                })
              }
            >
              <option value="plain">{text.plain}</option>
              <option value="highlight">{text.highlight}</option>
              <option value="box">{text.boxHighlight}</option>
              <option value="word">{text.wordByWord}</option>
            </Select>
            <Select
              label={text.font}
              value={document.captions.font}
              onChange={(value) =>
                change((next) => {
                  next.captions.font = value;
                })
              }
            >
              {fonts.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </Select>
            <div className={styles.twoColumns}>
              <Toggle
                label={text.bold}
                checked={document.captions.bold ?? false}
                onChange={(value) =>
                  change((next) => {
                    next.captions.bold = value;
                  })
                }
              />
              <Toggle
                label={text.captionUppercase}
                checked={document.captions.uppercase ?? false}
                onChange={(value) =>
                  change((next) => {
                    next.captions.uppercase = value;
                  })
                }
              />
            </div>
            <div className={styles.twoColumns}>
              <Field
                label={text.size}
                type="number"
                min={12}
                max={180}
                value={document.captions.size}
                onChange={(event) =>
                  change((next) => {
                    next.captions.size = Number(event.target.value);
                  })
                }
              />
              <Field
                label={text.wordsPerLine}
                type="number"
                min={1}
                max={10}
                value={document.captions.words_per_line}
                onChange={(event) =>
                  change((next) => {
                    next.captions.words_per_line = Number(event.target.value);
                  })
                }
              />
              <Field
                label={text.color}
                type="color"
                value={document.captions.color}
                onChange={(event) =>
                  change((next) => {
                    next.captions.color = event.target.value;
                  })
                }
              />
              <Field
                label={text.highlight}
                type="color"
                value={document.captions.highlight_color}
                onChange={(event) =>
                  change((next) => {
                    next.captions.highlight_color = event.target.value;
                  })
                }
              />
            </div>
            <Field
              label={text.position + ' (%)'}
              type="range"
              min={5}
              max={95}
              value={document.captions.position_y * 100}
              onChange={(event) =>
                change((next) => {
                  next.captions.position_y = Number(event.target.value) / 100;
                })
              }
            />
            <Field
              label={text.outline}
              type="range"
              min={0}
              max={12}
              step={0.5}
              value={document.captions.outline}
              onChange={(event) =>
                change((next) => {
                  next.captions.outline = Number(event.target.value);
                })
              }
            />
            <Select
              label={text.animation}
              value={document.captions.animation}
              onChange={(value) =>
                change((next) => {
                  next.captions.animation = value;
                })
              }
            >
              <option value="none">{text.none}</option>
              <option value="fade">{text.fade}</option>
              <option value="pop">{text.pop}</option>
            </Select>
            <hr className={styles.separator} />
            <CaptionRefinement
              models={models.data ?? []}
              language={language}
              disabled={isAndroidHost() || editing || pending || saving}
              running={Boolean(
                activeJobs?.some((job) => job.kind === 'captions' && job.clip_id === draft?.id),
              )}
              hasAudio={project?.has_audio ?? false}
            />
            <Button
              variant="ghost"
              onClick={() =>
                useEditor.getState().selectWords(document.words.map((word) => word.id))
              }
            >
              {text.selectAll}
            </Button>
            <div className={styles.wordList}>
              {document.words.map((word) => (
                <button
                  key={word.id}
                  type="button"
                  className={styles.word}
                  aria-pressed={selected.includes(word.id)}
                  onClick={(event) =>
                    useEditor
                      .getState()
                      .selectWords(
                        event.shiftKey
                          ? selected.includes(word.id)
                            ? selected.filter((id) => id !== word.id)
                            : [...selected, word.id]
                          : [word.id],
                      )
                  }
                >
                  {word.text || '…'}
                </button>
              ))}
            </div>
            {selectedWord && (
              <div className={styles.wordEditor}>
                <Field
                  label={text.text}
                  value={selectedWord.text}
                  onChange={(event) =>
                    change((next) => {
                      const word = next.words.find((word) => word.id === selectedWord.id)!;
                      word.text = event.target.value;
                      word.confidence = null;
                    })
                  }
                />
                <div className={styles.twoColumns}>
                  <Field
                    label={text.start + ' (s)'}
                    type="number"
                    min={0}
                    step={0.01}
                    value={selectedWord.start_ms / 1000}
                    onChange={(event) =>
                      change((next) => {
                        next.words.find((word) => word.id === selectedWord.id)!.start_ms =
                          Math.round(Number(event.target.value) * 1000);
                        next.words.sort((a, b) => a.start_ms - b.start_ms);
                      })
                    }
                  />
                  <Field
                    label={text.end + ' (s)'}
                    type="number"
                    step={0.01}
                    value={selectedWord.end_ms / 1000}
                    onChange={(event) =>
                      change((next) => {
                        next.words.find((word) => word.id === selectedWord.id)!.end_ms = Math.round(
                          Number(event.target.value) * 1000,
                        );
                      })
                    }
                  />
                </div>
                <Toggle
                  label={text.emphasis}
                  checked={Boolean(selectedWord.emphasis)}
                  onChange={(value) =>
                    change((next) => {
                      next.words
                        .filter((word) => selected.includes(word.id))
                        .forEach((word) => {
                          word.emphasis = value;
                        });
                    })
                  }
                />
                <Field
                  label={text.color}
                  type="color"
                  value={selectedWord.color ?? document.captions.color}
                  onChange={(event) =>
                    change((next) => {
                      next.words
                        .filter((word) => selected.includes(word.id))
                        .forEach((word) => {
                          word.color = event.target.value;
                        });
                    })
                  }
                />
                <Button
                  variant="danger"
                  onClick={() => {
                    change((next) => {
                      next.words = next.words.filter((word) => !selected.includes(word.id));
                    });
                    useEditor.getState().selectWords([]);
                  }}
                >
                  {text.delete}
                </Button>
              </div>
            )}
            <Button
              onClick={() => {
                const id = crypto.randomUUID();
                change((next) => {
                  const start = Math.min(playhead, next.end_ms - next.start_ms - 100);
                  next.words.push({
                    id,
                    text: '',
                    start_ms: Math.max(0, Math.round(start)),
                    end_ms: Math.min(next.end_ms - next.start_ms, Math.round(start + 350)),
                    emphasis: false,
                  });
                  next.words.sort((a, b) => a.start_ms - b.start_ms);
                });
                useEditor.getState().selectWords([id]);
              }}
            >
              {text.addWord}
            </Button>
          </>
        )}
        {tab === 'crop' && document && (
          <>
            <h2>{text.crop}</h2>
            <Button
              icon={<CropIcon />}
              disabled={isAndroidHost() || pending || editing || dirty || saving}
              onClick={() => void action(() => api.clipAction(draft!.id, 'track'))}
            >
              {editing ? text.running : text.autoCrop}
            </Button>
            {cropFields('crop')}
            <h3>{text.keyframes}</h3>
            {document.keyframes.map((keyframe, index) => (
              <div className={styles.wordEditor} key={keyframe.time_ms}>
                <small>{(keyframe.time_ms / 1000).toFixed(2)}s</small>
                <div className={styles.twoColumns}>
                  <Field
                    label={text.left + ' (%)'}
                    type="number"
                    min={0}
                    max={(1 - document.crop.width) * 100}
                    value={Number((keyframe.x * 100).toFixed(1))}
                    onChange={(event) =>
                      change((next) => {
                        next.keyframes[index].x = clamp(
                          Number(event.target.value) / 100,
                          1 - next.crop.width,
                        );
                      })
                    }
                  />
                  <Field
                    label={text.top + ' (%)'}
                    type="number"
                    min={0}
                    max={(1 - document.crop.height) * 100}
                    value={Number((keyframe.y * 100).toFixed(1))}
                    onChange={(event) =>
                      change((next) => {
                        next.keyframes[index].y = clamp(
                          Number(event.target.value) / 100,
                          1 - next.crop.height,
                        );
                      })
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  onClick={() =>
                    change((next) => {
                      next.keyframes.splice(index, 1);
                    })
                  }
                >
                  {text.delete}
                </Button>
              </div>
            ))}
            <Button
              onClick={() =>
                change((next) => {
                  const at = Math.round(playhead);
                  next.keyframes = next.keyframes.filter((key) => key.time_ms !== at);
                  next.keyframes.push({ time_ms: at, x: next.crop.x, y: next.crop.y });
                  next.keyframes.sort((a, b) => a.time_ms - b.time_ms);
                })
              }
            >
              {text.addKeyframe}
            </Button>
            {document.layout === 'gaming' && (
              <>
                <h3>{text.facecam}</h3>
                {cropFields('facecam_crop')}
                <h3>{text.gameplay}</h3>
                {cropFields('gameplay_crop')}
                <Field
                  label={text.split + ' (%)'}
                  type="range"
                  min={10}
                  max={90}
                  value={document.split_ratio * 100}
                  onChange={(event) =>
                    change((next) => {
                      next.split_ratio = Number(event.target.value) / 100;
                    })
                  }
                />
              </>
            )}
          </>
        )}
        {tab === 'title' && document && (
          <>
            <h2>{text.title}</h2>
            <Button
              disabled={
                isAndroidHost() ||
                pending ||
                editing ||
                dirty ||
                saving ||
                !selectionReady ||
                !document.words.some((word) => word.text.trim())
              }
              onClick={() => void action(() => api.clipAction(draft!.id, 'title'))}
            >
              {editing ? text.running : text.generateTitle}
            </Button>
            {!document.words.some((word) => word.text.trim()) && (
              <p className={styles.hint}>{text.titleWordsRequired}</p>
            )}
            <Field
              label={text.titleText}
              value={document.title.text}
              maxLength={300}
              onChange={(event) =>
                change((next) => {
                  next.title.text = event.target.value;
                })
              }
            />
            <Select
              label={text.preset}
              value={document.title.preset}
              onChange={(value) =>
                change((next) => {
                  next.title.preset = value;
                })
              }
            >
              <option value="bold">{text.bold}</option>
              <option value="plain">{text.plain}</option>
              <option value="boxed">{text.boxed}</option>
            </Select>
            <Select
              label={text.font}
              value={document.title.font}
              onChange={(value) =>
                change((next) => {
                  next.title.font = value;
                })
              }
            >
              {fonts.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </Select>
            <div className={styles.twoColumns}>
              <Field
                label={text.size}
                type="number"
                min={12}
                max={220}
                value={document.title.size}
                onChange={(event) =>
                  change((next) => {
                    next.title.size = Number(event.target.value);
                  })
                }
              />
              <Field
                label={text.color}
                type="color"
                value={document.title.color}
                onChange={(event) =>
                  change((next) => {
                    next.title.color = event.target.value;
                  })
                }
              />
            </div>
            <Field
              label={text.position + ' (%)'}
              type="range"
              min={5}
              max={95}
              value={document.title.position_y * 100}
              onChange={(event) =>
                change((next) => {
                  next.title.position_y = Number(event.target.value) / 100;
                })
              }
            />
            <Field
              label={text.titleDuration + ' (s)'}
              type="number"
              min={0}
              max={(document.end_ms - document.start_ms) / 1000}
              step={0.1}
              value={document.title.duration_ms / 1000}
              onChange={(event) =>
                change((next) => {
                  next.title.duration_ms = Math.round(Number(event.target.value) * 1000);
                })
              }
            />
          </>
        )}
        {tab === 'branding' && document && (
          <>
            <h2>{text.branding}</h2>
            <Select
              label={text.watermarkMode}
              value={document.watermark.mode}
              onChange={(value) =>
                change((next) => {
                  next.watermark.mode = value;
                })
              }
            >
              <option value="none">{text.none}</option>
              <option value="text">{text.text}</option>
              <option value="image">{text.image}</option>
            </Select>
            {document.watermark.mode === 'text' && (
              <>
                <Field
                  label={text.watermarkText}
                  maxLength={150}
                  value={document.watermark.text}
                  onChange={(event) =>
                    change((next) => {
                      next.watermark.text = event.target.value;
                    })
                  }
                />
                <Field
                  label={text.color}
                  type="color"
                  value={document.watermark.color}
                  onChange={(event) =>
                    change((next) => {
                      next.watermark.color = event.target.value;
                    })
                  }
                />
              </>
            )}
            {document.watermark.mode === 'image' && (
              <>
                <input
                  ref={imageInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label={text.uploadImage}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void action(async () => {
                        const result = await uploadFile<{ asset_id: string }>(
                          '/assets/upload',
                          file,
                        );
                        change((next) => {
                          next.watermark.asset_id = result.asset_id;
                        });
                      });
                    }
                    event.target.value = '';
                  }}
                />
                <Button
                  icon={<UploadSimpleIcon />}
                  disabled={pending}
                  onClick={() => imageInput.current?.click()}
                >
                  {text.uploadImage}
                </Button>
              </>
            )}
            {document.watermark.mode !== 'none' && (
              <>
                <div className={styles.twoColumns}>
                  <Field
                    label={text.left + ' (%)'}
                    type="number"
                    min={0}
                    max={100}
                    value={document.watermark.x * 100}
                    onChange={(event) =>
                      change((next) => {
                        next.watermark.x = clamp(Number(event.target.value) / 100);
                      })
                    }
                  />
                  <Field
                    label={text.top + ' (%)'}
                    type="number"
                    min={0}
                    max={100}
                    value={document.watermark.y * 100}
                    onChange={(event) =>
                      change((next) => {
                        next.watermark.y = clamp(Number(event.target.value) / 100);
                      })
                    }
                  />
                </div>
                <Field
                  label={text.scale + ' (%)'}
                  type="range"
                  min={2}
                  max={80}
                  value={document.watermark.scale * 100}
                  onChange={(event) =>
                    change((next) => {
                      next.watermark.scale = Number(event.target.value) / 100;
                    })
                  }
                />
                <Field
                  label={text.opacity + ' (%)'}
                  type="range"
                  min={0}
                  max={100}
                  value={document.watermark.opacity * 100}
                  onChange={(event) =>
                    change((next) => {
                      next.watermark.opacity = Number(event.target.value) / 100;
                    })
                  }
                />
              </>
            )}
          </>
        )}
        {tab === 'timeline' && document && <TimelineEditor key={draft!.id} />}
      </div>
    </aside>
  );
}
