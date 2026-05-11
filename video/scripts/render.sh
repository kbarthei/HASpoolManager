#!/usr/bin/env bash
# Self-healing render wrapper: ensures the music bed exists, then renders
# both 16:9 and 9:16 (or just the requested one). Run from the video/ dir.
#
# Usage:
#   npm run render              # both formats with music
#   npm run render -- horizontal
#   npm run render -- vertical
#   npm run render -- --no-music
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
MUSIC="$ROOT/public/music.mp3"
ENTRY="$ROOT/src/index.ts"

WANT_HORIZONTAL=1
WANT_VERTICAL=1
WITH_MUSIC=1

for arg in "$@"; do
  case "$arg" in
    horizontal|16:9|h) WANT_VERTICAL=0 ;;
    vertical|9:16|v)   WANT_HORIZONTAL=0 ;;
    --no-music)        WITH_MUSIC=0 ;;
    *) echo "render.sh: unknown arg '$arg' (expected: horizontal | vertical | --no-music)" >&2; exit 2 ;;
  esac
done

# Self-healing music check: silently fetch if missing (idempotent). Without
# this guard the previous renders produced a soundless video — the
# Soundtrack component silently fell through to `return null` and the
# render finished green. Now: if --no-music wasn't passed, the music
# bed MUST be present, fetch-or-fail.
if [[ $WITH_MUSIC -eq 1 ]]; then
  if [[ ! -f "$MUSIC" ]]; then
    echo "render.sh: music.mp3 missing → running setup:music"
    bash "$ROOT/scripts/fetch-music.sh"
  fi
  if [[ ! -f "$MUSIC" ]]; then
    echo "render.sh: ERROR — music.mp3 still missing after setup. Network blocked? Pass --no-music to render silent." >&2
    exit 1
  fi
  size=$(stat -f%z "$MUSIC" 2>/dev/null || stat -c%s "$MUSIC")
  if [[ "$size" -lt 100000 ]]; then
    echo "render.sh: ERROR — music.mp3 too small ($size bytes), likely a partial download. Delete it and re-run." >&2
    exit 1
  fi
fi

MUSIC_PROPS=""
if [[ $WITH_MUSIC -eq 0 ]]; then
  MUSIC_PROPS='--props={"withMusic":false}'
fi

render() {
  local comp="$1"
  local out="$2"
  echo "render.sh: rendering $comp → $out"
  npx remotion render "$ENTRY" "$comp" "$out" \
    --codec=h264 --crf=18 --pixel-format=yuv420p --concurrency=2 \
    --public-dir="$REPO_ROOT" \
    $MUSIC_PROPS
}

mkdir -p "$ROOT/out"
[[ $WANT_HORIZONTAL -eq 1 ]] && render HASpoolManagerDemo         "$ROOT/out/haspoolmanager-demo.mp4"
[[ $WANT_VERTICAL   -eq 1 ]] && render HASpoolManagerDemoVertical "$ROOT/out/haspoolmanager-demo-vertical.mp4"

# Post-render audio guard: ffprobe-confirm there's an audio stream when
# we asked for one. Tolerates ffprobe being missing (just warns).
if [[ $WITH_MUSIC -eq 1 ]] && command -v ffprobe >/dev/null 2>&1; then
  for f in "$ROOT/out/haspoolmanager-demo.mp4" "$ROOT/out/haspoolmanager-demo-vertical.mp4"; do
    [[ -f "$f" ]] || continue
    streams=$(ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$f" 2>/dev/null)
    if [[ -z "$streams" ]]; then
      echo "render.sh: ERROR — $f has no audio stream even though --no-music wasn't passed." >&2
      exit 1
    fi
  done
  echo "render.sh: ✓ audio streams verified"
elif [[ $WITH_MUSIC -eq 1 ]]; then
  echo "render.sh: (skipping audio-stream verification — ffprobe not installed)"
fi

echo "render.sh: done"
