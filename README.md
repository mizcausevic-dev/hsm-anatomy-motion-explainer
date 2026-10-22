# HSM Anatomy: a code-driven motion explainer

A 34-second anatomy-style explainer of a **hardware security module (HSM)**. It runs 1,020 frames at 30 fps (frames 0–1019), and each frame is rendered in code from its frame index. It traces one signing request across a cryptographic boundary: reveal the boundary, generate a key, authorize the request, sign internally, then verify and audit.

**Live preview:** https://mizcausevic-dev.github.io/hsm-anatomy-motion-explainer/
**Rendered video:** `media/hsm-explainer-Cursor.mp4` on the live site (a download link appears in the header)
**Medium draft:** [`article/medium-article-Cursor.md`](article/medium-article-Cursor.md) · hero: [`article/hero-Cursor.png`](article/hero-Cursor.png)

Mechanism reference: [NIST CSRC Glossary: Hardware Security Module (HSM)](https://csrc.nist.gov/glossary/term/hardware_security_module_hsm), which defines an HSM as "a physical computing device that safeguards and manages cryptographic keys and provides cryptographic processing."

## Run locally

```bash
npm install
npm run dev          # http://localhost:43127
npm run build        # type-check + static build into dist/
npm run preview      # serve dist/ on :43128
```

Player controls: <kbd>Space</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd> step one frame (<kbd>Shift</kbd> = 1 s), <kbd>1</kbd>–<kbd>5</kbd> jump to a chapter, <kbd>Home</kbd>/<kbd>End</kbd>. Add `?f=420` to the URL to open on a specific frame.

## Export video and stills

The exporter drives the same `renderFrame()` used by the player in headless Chrome and pipes PNG frames to ffmpeg.

```bash
npm run dev                                   # in one terminal
npm run render:video                          # → out/hsm-explainer-Cursor.mp4 (H.264, 1920×1080, 30 fps)
npm run render:hero                           # → out/hero-Cursor.png (1920×1080)
node scripts/render.mjs frames 0,150,510      # → out/frames/f0000.png …
```

Requires `ffmpeg` and a local Chrome. Set `CHROME_PATH` if Chrome is not at `/usr/local/bin/google-chrome`.

## Timeline

| Frames | Time | Chapter | Camera |
|---|---|---|---|
| 0–149 | 0–5 s | Reveal boundary | Full assembly, then a three-quarter push toward the active region |
| 150–299 | 5–10 s | Generate key | Sectional close-up: entropy source → DRBG → crypto engine → key store |
| 300–509 | 10–17 s | Authorize request | Tracks host → interface → access control → engine. Input, output, and control lanes are kept separate |
| 510–749 | 17–25 s | Sign internally | Close on engine + key store, with a qualitative signing inset and a boundary ledger |
| 750–1019 | 25–34 s | Verify and audit | Pulls back to a stable overview with the audit log and a limits panel |

Every timing marker lives in `src/scene/storyboard.ts` (`CHAPTERS`, `CAMERA`, `CAPTIONS`, `T`).

## Architecture

```
src/
  engine/math.ts       frame constants, easing, deterministic hash (no Math.random at render)
  engine/camera.ts     keyframed orbit camera + perspective projector
  scene/model.ts       conceptual component layout + overlay paths (input/output lanes separated)
  scene/storyboard.ts  chapters, camera keys, captions, event markers
  scene/render.ts      renderFrame(ctx, frame): geometry, overlays, insets, HUD
  main.ts              player UI, keyboard control, headless render hook (window.__hsm)
scripts/render.mjs     headless Chrome → ffmpeg exporter
```

Color semantics: **cyan `#00E5FF`** for transport and signal, **gold `#FFD166`** for energy and actuation, **violet `#9D4EDD`** for control and state. Materials use a neutral `#344257` on a `#0B1019` stage. These colors are explanatory overlays. They do not represent light emitted by the hardware.

## Factual scope

- This is a conceptual schematic. Layout, sizes, and materials are arbitrary choices for legibility and do not describe any product.
- Non-exportability of key K1 is an explicitly selected configuration. Other configurations, such as wrapped export for backup, exist and are not shown.
- No dimensions, performance figures, certifications, or vendor internals are claimed.
- Time is compressed. The energy-to-heat cue is qualitative, not measured.
- The audit hash chain is drawn conceptually. Real log formats vary by product.
- Camera moves, palette, cutaways, and timing are original illustrative choices.

## Deploy

GitHub Pages serves the `gh-pages` branch, which contains the `dist/` build. To redeploy:

```bash
npm run build
# then publish dist/ to the gh-pages branch, for example:
git -C dist init -b gh-pages && git -C dist add -A && git -C dist commit -m deploy
git -C dist push -f https://github.com/mizcausevic-dev/hsm-anatomy-motion-explainer.git gh-pages
```

## Reusing the engine in other verticals

The engine is not specific to HSMs. It is a keyframed camera, a projected box model, typed overlay lanes (input, output, control, energy, actuation), anchored labels, and inset panels. To explain another system, replace `model.ts` and `storyboard.ts`. Examples: a TPM attestation flow, a payment terminal PIN path, a medical device data pipeline, or the boundary of a zero-trust gateway.

## License

MIT for the code. Fonts are bundled through `@fontsource` (SIL Open Font License).
