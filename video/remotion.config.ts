/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig(enableTailwind);

// publicDir = parent repo root, so staticFile("screenshots/...") resolves
// straight onto HASpoolManager's canonical /screenshots/ tree (no copy,
// no symlink). Trade-off: video-specific assets like music.mp3 need
// longer paths — see Soundtrack.tsx for `video/public/music.mp3`.
Config.setPublicDir("..");
