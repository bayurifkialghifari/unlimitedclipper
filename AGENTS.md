# Repository instructions

## Read before changing behavior

Read PRD.md, architecture.md, the relevant file in docs/features/, and DESIGN.md for UI changes. The project uses original source. Do not copy SupoClip source or competitor branding.

## Language and readability

- All documentation, code identifiers, and comments must use English. UI text belongs in the Indonesian and English dictionaries.
- Write one statement per line. Use braces and multiline blocks. Do not compress functions, components, control flow, or complex callbacks onto one line.
- Keep JSX readable, extract repeated controls, and keep components focused on one purpose.
- Run ESLint and Prettier. Use the committed configuration, 100-column print width, and two-space JavaScript/TypeScript indentation.
- Run Rustfmt and Clippy for Rust changes. Do not ignore warnings to make a build pass.
- Comments explain constraints, intent, concurrency, or non-obvious behavior. Avoid decorative banners, restating code, or vague TODOs.

## Architecture

- UI layers are atoms, molecules, organisms, templates, and pages. Atoms and molecules do not fetch data or launch tools.
- Keep business behavior in the Rust engine. Desktop and browser use the same API contracts and persistent state.
- Do not store video binaries in SQLite. Keep application data separate from installed binaries.
- Use integer milliseconds for persisted times. Preserve source timing and distinguish source time from clip-relative time.
- Export an immutable edit revision. Autosave uses revision checks; never silently overwrite another editor's work.
- Spawn tools with argument arrays, never shell interpolation. Restrict assets to registered managed files.
- Preserve completed checkpoints on retries. A cancelled job is terminal only after its child process has stopped.
- Process one heavy job at a time until measured resource limits justify changing that policy.

## Design filter

Anti-slop is active in During mode for this project. Read the [core skill](https://github.com/miqdadbadjuber/anti-slop/blob/main/skills/antislop/SKILL.md), [UI skill](https://github.com/miqdadbadjuber/anti-slop/blob/main/skills/antislop-ui/SKILL.md), and [comment skill](https://github.com/miqdadbadjuber/anti-slop/blob/main/skills/antislop-code/SKILL.md) when applicable. Apply DESIGN.md as direction and the skills as filters.

- Every enabled control must work. Do not ship decorative buttons or invented project data.
- Implement empty, loading, error, disabled, hover, active, and keyboard-focus states.
- Preserve keyboard operation, visible labels, accessible names, contrast, and reduced-motion support.
- Use text branding until a custom logo is explicitly supplied. Do not fabricate testimonials, statistics, or performance claims.
- Record the anti-slop delivery gate and interaction evidence in docs/validation.md. Unrun checks are pending, never PASS.

## Verification and documentation

Run npm run check, npm run test:rust, Rustfmt check, and Clippy after relevant changes. Use real processing fixtures for timing, export, and recovery changes. Test native desktop behavior separately from browser behavior.

Update feature documentation with changed behavior and limitations. Changelog entries describe completed work. Never claim all operating systems, AI accuracy, or packaged releases are verified without evidence.
