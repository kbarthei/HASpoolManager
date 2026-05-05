# video/ — HASpoolManager Demo Video (Remotion)

Subfolder of HASpoolManager that produces a 90-second product demo video.
Lives inside the parent repo so Remotion source code, screenshots, and the
addon UI ship in lockstep.

## Layout

```
video/
├── src/
│   ├── beats/Beat[1-9]*.tsx     # one beat per file
│   ├── components/              # reusable primitives (ScreenshotFrame, …)
│   ├── data/                    # mockData.ts + subtitles.ts
│   ├── theme.ts                 # mirrors HASpoolManager Apple-system tokens
│   └── Root.tsx                 # registers HASpoolManagerDemo (16:9) + …Vertical (9:16)
├── public/
│   ├── screenshots/             # gitignored — synced from ../screenshots/
│   └── music.mp3                # gitignored — fetched via setup:music
├── scripts/
│   └── fetch-music.sh           # Pixabay CC0 grab
├── docs/superpowers/            # historical plan + spec docs (Remotion-internal)
├── out/                         # gitignored render output
├── package.json
├── remotion.config.ts
├── tsconfig.json
└── eslint.config.mjs
```

## Source assets

`remotion.config.ts` sets `publicDir: ".."` so Remotion's `staticFile()`
resolves directly against the parent repo root. No copy, no symlink,
no `setup:screenshots` step:

- `staticFile("screenshots/light/desktop/01-dashboard.png")` →
  `<HASpoolManager>/screenshots/light/desktop/01-dashboard.png`
- `staticFile("video/public/music.mp3")` → the music bed (video-only,
  needs the longer path because publicDir is now repo root).

Edit a PNG at `/screenshots/`; the video picks it up on the next
`npm run dev` reload.

```
../screenshots/
├── dark/{desktop,mobile,social-square}/
├── light/{desktop,mobile,social-square}/
└── light/desktop/sections/    ← card-level clips
```

## Setup

```bash
npm ci                    # iCloud sometimes corrupts node_modules — re-install
npm run setup             # fetches Pixabay CC0 music to public/music.mp3
npm run lint              # eslint + tsc; must pass before render
npm run dev               # Remotion Studio
```

## Render

```bash
npx remotion render HASpoolManagerDemo \
  out/haspoolmanager-demo.mp4 \
  --codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=2

npx remotion render HASpoolManagerDemoVertical \
  out/haspoolmanager-demo-vertical.mp4 \
  --codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=2
```

GIF (palette two-pass via ffmpeg) — see `docs/superpowers/plans/`.

## Architecture

- 9 beats × 90s @ 30fps = 2700 effective frames (BEAT_SUM 2820 minus
  8×15 transition overlap).
- Single `Demo` composition takes `{ layout, withMusic }` props; `Root.tsx`
  registers `HASpoolManagerDemo` (1920×1080) and `HASpoolManagerDemoVertical`
  (1080×1920).
- Theme tokens in `src/theme.ts` mirror HASpoolManager's dark palette
  (`#000` bg, `#40C8E0` accent, Geist fonts).
- Mock data in `src/data/mockData.ts` matches what the screenshots show
  (e.g. `inspectorSpool` = 810g/81% of 1000g, €0.013/g).

## Conventions

- **Don't add fake numbers that disagree with the real screenshots.** When a
  callout would duplicate or contradict a stat the screenshot already shows,
  drop the callout and use a `Spotlight` to direct attention instead.
- **Subtitles** in English; lower-third in 16:9, top banner in 9:16. Track
  in `src/data/subtitles.ts` with absolute composition frames.
- **Music** is optional. `Soundtrack` reads `public/music.mp3` and renders
  nothing if missing. Render with `--props='{"withMusic":false}'` to skip.
- **Tall page-scroll screenshots** (e.g. `05-prints.png` is ~2880×14870)
  must use `ScreenshotFrame fit="top-aligned"` (uses `objectFit: cover`).
- **One commit per logical step.** Co-Authored-By trailer per parent repo
  convention.

## Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module '@remotion/bundler/...'` | iCloud sync ate `node_modules` | `npm ci` |
| `staticFile('screenshots/...') 404` | `publicDir` not set or repo root missing screenshots | check `remotion.config.ts` has `Config.setPublicDir("..")` and `/screenshots/` exists |
| Tall screenshot renders as thin vertical strip | `objectFit: contain` on portrait PNG | `ScreenshotFrame fit="top-aligned"` |
| Last 90 frames render black | TransitionSeries overlap subtracted | `TOTAL_DURATION = BEAT_SUM - N_TRANSITIONS × TRANSITION_FRAMES` |
| Lint warning `@remotion/non-pure-animation` | CSS `transition` property used | Remove or replace with frame-driven animation |

## Plans + specs

Live in `docs/superpowers/{plans,specs}/`. Current canonical plan:
`docs/superpowers/plans/2026-05-04-haspoolmanager-demo-video-v2.md`
(absolute `my-video` paths in there are pre-migration — read them with
that lens; the new path is `video/`).
