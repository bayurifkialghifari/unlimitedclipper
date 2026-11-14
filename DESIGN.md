# Studio design direction

Reading this as a video editing studio for independent creators, using blue graphite surfaces and a restrained amber accent. Dials: ENERGY 2 / RHYTHM 2 / MOTION 1.

| Decision           | Direction                                                                 | Purpose                                                                     |
| ------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Workspace          | Source toolbar, large preview, right inspector, clip rail, process status | Keep source, edits, and results visible together.                           |
| Theme              | Blue graphite surfaces, warm white text, muted blue-gray secondary text   | Let the footage remain the visual focal point during long editing sessions. |
| Accent             | Amber for the primary action, selected clip, and playhead                 | Give the studio its own identity and make the current decision visible.     |
| UI typography      | Self-hosted DM Sans                                                       | Keep dense settings and bilingual labels readable.                          |
| Display typography | Self-hosted Oswald                                                        | Give workspace titles a compact editorial voice.                            |
| Caption fonts      | Bundled Noto Sans and licensed selectable fonts                           | Keep preview and exports consistent and render multilingual text.           |
| Radius             | 8px controls, 14px panels, 20px preview                                   | Distinguish controls, groups, and the footage.                              |
| Motion             | Short state transitions, no decorative loops                              | Show selection and processing changes without distracting from playback.    |
| Branding           | Approved original frame/cut icon with UnlimitedClipper text               | Make the application recognizable in the taskbar and project documentation. |

Desktop layouts keep the preview beside the inspector. Narrow layouts use a stacked preview and tabbed settings without horizontal overflow. Use native controls where possible, minimum 44px touch targets, meaningful labels, and visible focus rings. Project galleries show real thumbnails and records, never invented usage statistics.

The visual editor uses a viewport-fitting three-column workspace: clips/transcript on the left,
footage in the center, precise controls on the right, and a timeline underneath. Independent
panel scrolling keeps the footage and playhead visible. Narrow layouts toggle side panels.
Source scenes, caption words, visual layers, and audio layers use separate timeline rows; muted
blue and amber distinguish media tracks, while amber outlines mark selection/playhead feedback. Drag
previews have no decorative motion. Successful job notifications clear after six seconds to
return access to the workspace; active processing and errors remain reviewable.

Only the inspector body scrolls inside the right panel; tabs stay visible. The outer panel
must never add a second scrollbar. Scroll thumbs use muted blue-gray against the inset
surface, with an eight-pixel desktop rail and native forced-color fallback. Keyboard tab
navigation and narrow-screen panel toggles remain available. Discovery results show the actual
accepted/target count and rejection reasons. Framing controls name Follow, Two-face split, and
Facecam modes and explain missing detections without claiming active speaker detection.

The owner approved the original frame-and-cut mark and the current graphite/amber palette for the app, installer, browser,
and README. Its master is resources/brand/app-icon.svg. Run npm run generate:icons to derive native
icon formats and synchronize browser/README assets. Competitor marks are not reused.

Captions use short stable phrases so viewers can anticipate surrounding words while tracking the spoken word. Bold DM Sans is the default; compact uppercase Oswald provides a stronger reaction style. A red active-word box follows the reference's demonstrated interaction without importing its assets. Preset previews use the current clip's real words. Position and visibility remain separate from the chosen look. Accuracy controls sit next to caption edits because uncertain recognition needs an immediate correction path.
