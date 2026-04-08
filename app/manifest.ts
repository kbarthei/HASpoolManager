import type { MetadataRoute } from "next";

// Web app manifest — Next.js serves this at /manifest.webmanifest.
// Combined with apple-icon.tsx and the apple-mobile-web-app meta tags
// in layout.tsx, this lets iOS treat the app as a standalone PWA when
// the user uses Safari → "Add to Home Screen".
//
// On HA ingress the URL contains a session token; the manifest still
// works because the relative scope/start_url are resolved against the
// session-prefixed origin at the time the user adds it.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HASpoolManager",
    short_name: "Spools",
    description: "3D Printing Filament Lifecycle Manager",
    start_url: ".",
    scope: ".",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0d9488",
    icons: [
      {
        src: "apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
