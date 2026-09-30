// MapLibre 6 runs tile work in a module worker that it loads from a file next to
// its own script. Once bundled, that file isn't there, so we serve the worker
// (and the shared chunk it imports) from public/ and point MapLibre at it.
// Runs before `dev` and `build` so it always matches the installed version.
import { copyFileSync, mkdirSync } from "node:fs";

const out = "public/vendor/maplibre";
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `${out}/${f}`);
}
