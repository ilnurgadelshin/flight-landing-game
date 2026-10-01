# Renderer performance — 2026-09-28

Measured on Apple M2 Pro using Chromium 141.0.7390.37, ANGLE Metal, macOS arm64.
The GPU renderer string was checked; these are not SwiftShader results.

The baseline is pushed main `b707c85`. The followup adds close-ground detail, blended
camera-facing tree views, facade relief and feathered building shadows.

| Quality / scene | Baseline FPS | Followup FPS | Frame ms p50 / p95 | CPU submission ms p50 / p95 | Draw calls (median) |
| --- | ---: | ---: | ---: | ---: | ---: |
| High / captain | 31.9 | 31.5 | 33.3 / 33.4 | 3.8 / 7.6 | 940 |
| High / nearby | 41.4 | 40.5 | 16.7 / 33.4 | 2.9 / 6.4 | 408 |
| High / storm | 48.0 | 47.9 | 16.7 / 33.4 | 3.9 / 5.5 | 934 |
| Low / captain | 60.0 | 60.0 | 16.7 / 16.8 | 2.5 / 3.4 | 513 |
| Low / nearby | 60.0 | 60.0 | 16.7 / 16.7 | 2.2 / 4.6 | 270 |
| Low / storm | 60.0 | 60.0 | 16.7 / 16.7 | 2.9 / 4.6 | 491 |

Viewport: **1440 × 900 CSS pixels**. High uses the usual **1.5×** pixel ratio
(**2160 × 1350 render pixels**); low uses **1×**. Each scene warms for four seconds
and samples for twelve seconds. Scene, weather, planting seed and camera path match.
The near-ground camera moves through 30 m, exercising scenery selection and tree fades.
High uses world MSAA/bloom and the detailed cockpit; low uses its normal cheaper assets.

These measurements show broadly similar performance to the baseline, not a demonstrated
speedup. The high tier is around 31–48 FPS at this render scale; low is display-capped near
60 FPS. A preliminary corrected 1× baseline was around 59–60 FPS on high, showing the
substantial cost of the extra rendered pixels. Do not compare those numbers as a code improvement.

Limits: this is a private headless Chromium renderer benchmark with flight physics paused;
world updates, LOD selection and rendering still run. It does not measure a complete live
landing, another browser, mobile hardware, loading time or battery use. RAF cadence is
capped near 60 Hz. CPU submission time excludes asynchronous GPU work; frame pacing
includes it. Short runs and OS/GPU scheduling introduce variation. No frame-time assertion
is used as a portable pass/fail test.

Run without other graphics tests or heavy applications competing for the GPU:

```sh
PLAYWRIGHT_BROWSERS_PATH=/path/to/chromium-cache node test/render-benchmark.mjs current
```

The script currently targets macOS Metal and refuses unverified/software renderer strings.
`BENCHMARK_DPR=1` changes high-quality pixel ratio explicitly; low always stays at 1.
`BENCHMARK_ROOT=/path/to/committed/snapshot` serves a baseline without modifying the working
checkout. Results are written to `test/output/render-benchmark-<label>.json`.

The retained before/after JSON reports are copied into `test/benchmarks/` for inspection.
An initial setup that failed to restore the cockpit camera and used its local position
for ground streaming was rejected and rerun before this comparison.

## Cockpit lighting and surveyed terrain — 2026-09-30

Baseline: committed main `e66583b`. Followup: scanned cockpit finishes, cached cabin
reflections/window illumination and registered USGS terrain. Both versions were measured
on the same Apple M2 Pro, Chromium 141.0.7390.37 and ANGLE Metal, with the resolution,
camera paths and sampling method described above. Runs were sequential, without other
graphics tests competing for the GPU. Reports: `benchmarks/2026-09-30-before.json` and
`benchmarks/2026-09-30-after.json`.

| Quality / scene | Baseline FPS | Followup FPS | Frame ms p50 / p95 | CPU submission ms p50 / p95 | Draw calls (median) |
| --- | ---: | ---: | ---: | ---: | ---: |
| High / captain | 30.1 | 28.5 | 33.3 / 50.0 | 4.4 / 9.1 | 940 |
| High / nearby | 37.7 | 36.1 | 33.3 / 33.4 | 2.9 / 5.9 | 408 |
| High / storm | 46.3 | 44.5 | 16.7 / 33.4 | 4.0 / 5.5 | 934 |
| Low / captain | 60.0 | 60.0 | 16.7 / 16.7 | 2.6 / 3.5 | 513 |
| Low / nearby | 60.0 | 60.0 | 16.7 / 16.7 | 2.0 / 3.9 | 270 |
| Low / storm | 60.0 | 60.0 | 16.7 / 16.7 | 2.5 / 3.6 | 491 |

High average FPS decreased approximately 4–5%; the captain scene's p95 frame time
increased from 33.5 to 50.0 ms. Low remained at the 60 Hz display ceiling. This is a
quality/performance tradeoff, not a speedup. Draw calls are unchanged; terrain skirts add
about 15–18 thousand rendered triangles in high scenes. An initial implementation that
evaluated two area lights per pixel every frame was substantially slower and was replaced
by cached diffuse window illumination plus area-lit reflection captures before this run.

These short steady-state runs do not measure the initial cabin capture, scenario-switch
stalls, full-flight physics, other GPUs or mobile devices. The earlier benchmark's limits
still apply; the 2026-09-28 and 2026-09-30 numbers should not be treated as a controlled
comparison with each other.

## Review fixes — 2026-09-30

Baseline is `a406f27`. The baseline, updated fixed-scale scene and updated default-scale
scene were measured sequentially on the same Apple M2 Pro / Chromium 141 / ANGLE Metal,
with no other graphics tests running. Both scenes had all optional scenery and near-tree
assets loaded before sampling. Physics remained paused; this is steady-state renderer
pacing, not a full-flight or loading-stall benchmark. The three JSON reports are
`benchmarks/2026-09-30-review-{before,fixed,default-scale}.json`.

| Scene | Before, high 1.5× FPS | Fixed, high 1.5× FPS | Fixed, high 1× FPS | 1× frame ms p50 / p95 |
| --- | ---: | ---: | ---: | ---: |
| Captain | 29.7 | 30.0 | 54.7 | 16.7 / 33.3 |
| Nearby | 37.6 | 37.0 | 60.0 | 16.7 / 16.7 |
| Storm | 46.4 | 46.3 | 60.0 | 16.7 / 16.7 |

Low stayed at the 60 Hz ceiling in all three runs. At **matched resolution**, rendering
cost is broadly unchanged. The default-scale gain comes primarily from drawing 1440×900
instead of 2160×1350 pixels, not a demonstrated algorithmic speedup. High captain p95
remains 33.3 ms at 1×, so it is not a locked 60 FPS. Smaller fir models allow the bounded
tree selector to display more trees nearby (21 rather than 15 here), so reducing the file
and per-tree geometry does not imply a lower scene triangle count.

Desktop automatic mode uses a bounded initial frame sample at 1×. It selects low when
foreground measurement is incomplete or p90 exceeds 22.5 ms. A hidden tab waits; hiding it
during calibration discards that sample and retries after it becomes visible. Continued adaptive resolution and a
low-effects fallback respond to sustained slow flight after scenery loads. Explicit
`?quality=high` retains the user's fixed tier. The benchmark above explicitly selects
tiers/scales; a separate browser check verifies that deliberately slow RAF cadence selects
low, leaves scenery registered to the rendered terrain and never loads high-tier trees.

The follow-up review fix separates the initial scale from its ceiling. Automatic desktop
mode can rise by 10% after each ten seconds of fast frames (average below 18 ms), up to the
native screen ratio or 1.5×, whichever is lower. A slow interval lowers that ceiling as
before. This removes the permanent 1× limit; it does not establish that the M2 Pro or every
Retina machine can sustain 1.5×. The table above remains a fixed-scale benchmark from the
preceding revision, not a new measurement of adaptive behavior.

### Delivery

Transfer counts are same-origin **resource body bytes** from the private test server,
excluding the HTML document/HTTP overhead, without production gzip/Brotli or a warm cache.
The committed baseline waits for all assets; the updated startup waits for the cockpit and
four 512px terrain previews. Full scenery loads after the first playable frame. Raw reports
are in the benchmark JSON and `benchmarks/2026-09-30-delivery.json`.

| Tier | Before startup | Updated startup | Updated with streamed scenery | Including near trees |
| --- | ---: | ---: | ---: | ---: |
| High | 59.54 MB | 13.85 MB | 35.03 MB | 45.76 MB |
| Low | 15.02 MB | 8.52 MB | 13.35 MB | 13.35 MB |

The whole asset directory decreased from 82.61 MB to approximately 57.7 MB; the rest of
the site is additional. Desktop startup remains substantial because it retains the authored
flight deck. WebP photos retain their dimensions; tree atlas alpha is unchanged and packed
cockpit scan channels are pixel-identical to their originals. The 8.00 MB fir model is now
5.63 MB. Original JPG/PNG delivery duplicates are removed. Background requests can still
produce decode/upload stalls; those costs are not represented by the warmed FPS numbers.

### Correctness and suite runtime

The full browser suite completed **270 checks, zero failures, in 352 seconds with three
processes** on ANGLE Metal, including the controller landing and complete graphics group.
Functional groups retain the real low-detail cockpit, simulation and controls; they skip
optional scenery streaming and reflection rebakes through a test helper. Graphics/asset
checks explicitly await the complete scene. E3 checks the intended 58° FOV and −14° pitch.

The lighting test also passed deliberate invalid-pixel and thrown-capture failures: a lit
panel remains, no area lights exist in the rendered scene, and failed captures are not
retried every frame. SwiftShader could not create WebGL on this Mac and is **unverified**;
neither these GPU tests nor the 352-second runtime establish compatibility/performance on
the external reviewer's driver or the earlier software-renderer reference machine.

## Performance → vegetation → clouds — 2026-10-01

Baseline is `74a0fe4`, served from an archived snapshot. Measurements use the same Apple M2
Pro, Chromium 141 / ANGLE Metal and 1440×900 CSS viewport. High remains at **1.5×**, low at
**1×**; there is no automatic resolution scaling in these runs. Each scene has all scenery
loaded, four seconds of warm-up and twelve seconds of sampling, with paused flight physics.
GPU benchmarks run sequentially. The baseline was repeated before the final run to expose
normal run-to-run variation. The recorded JSON files are `benchmarks/2026-10-01-*.json`.

| High scene | Before, two runs (FPS) | Optimization | + Vegetation | + Clouds, final |
| --- | ---: | ---: | ---: | ---: |
| Captain | 28.5–29.3 | 41.9 | 42.7 | 41.3 |
| Nearby | 34.7–37.4 | 54.1 | 55.6 | 52.8 |
| Storm | 42.6–45.2 | 44.7 | 45.5 | 44.5 |

All low-tier scenes stayed near the 60 Hz ceiling. Captain p95 improved from **50.0 to
33.4 ms**; nearby and storm p95 stayed approximately **33.3–33.4 ms**. This is a material
improvement at the original resolution, but does not establish locked 60 FPS on high.
Draw calls and submitted triangles remain unchanged in these benchmark views.

1. **Optimization:** precomputed density replaces repeated procedural noise in the cumulus
   view/shadow march. Settled nearby trees reuse transforms, colours and bounding spheres;
   changing LOD fades only upload changed scalar attributes.
2. **Vegetation:** four azimuths × three elevations retain canopy area from above. Each distant
   tree remains one quad; four blended texture samples replace two. Smaller atlas frames
   offset the added views. The measured cost stayed within ordinary variation.
3. **Clouds:** four connected-billow variants, a 36-step rather than 28-step march and modest
   directional scattering improve the volume. Overcast colour and relief share multiscale
   structure; existing vertices are concentrated near the eye, with no extra triangles.
   The final runs measured about 1–3 FPS below the vegetation stage. The repeated baseline
   also varied by up to 2.7 FPS, so these are approximate costs, not isolated GPU timings.

The cloud payload is 79,064 bytes compressed, expanding to a 1 MiB R8 volume. Earlier stage
benchmark JSON includes an uncompressed prototype in its `startupBytes`; those values are
not the final delivery measurement. Final request counts are in `2026-10-01-delivery.json`:

| Tier | Until menu | With scenery | Including near trees |
| --- | ---: | ---: | ---: |
| High | 13.93 MB | 34.34 MB | 45.07 MB |
| Low | 8.53 MB | 13.20 MB | 13.20 MB |

Body bytes exclude the HTML document and HTTP overhead. The two canopy atlases shrink from
1,772,922 to 834,516 bytes; adding cloud density still reduces asset payload by **859,342
bytes** overall. Scenery/model streaming and decoding stalls remain outside this warmed
benchmark. No claims are made about other hardware or the unavailable local SwiftShader backend.

## Smooth flight on a MacBook Pro — 2026-10-01

Reported on an M2 MacBook Pro after `e5cc6ed`: sharper trees and ground appeared during the
flight, with low-detail artefacts first, and flying felt laggy. Causes, as measured (SwiftShader
counts what is submitted, not how fast an M2 draws it):

| Cause | Before | After |
| --- | ---: | ---: |
| Airport sun shadow map (4096×2048, every airport caster) redrawn in 2 s at 270 ft | 12× | 1× |
| Flight-deck shadow pass triangles (every frame) | 1,079 k | 492 k |
| Captain view at 4 nm, per frame: draw calls / triangles | 1,427 / 2.81 M | 1,397 / 2.23 M |
| Requests during the first 12 s of a flight (clear, storm, low) | photos, tiles, buildings, trees… | 0 |
| Shader programs / textures / geometries created after the flight's first frame | not measured | 0 / 0 / 0 |

1. **Scenery streamed into the flight.** Full photographs, detail tiles, buildings, woodland and
   nearby tree models loaded after the flight began; each arrival sharpened or added something in
   view and stalled frames to decode, upload and compile. It now loads behind the menu, all 16
   detail tiles included (12 MB high, 3 MB low; four on the GPU, the rest decoded from memory),
   then `World.warmUp()` compiles every shader and draws everything once into a 16×16 target,
   one material at a time in slices of about 12 ms so the menu stays responsive (software
   rendering compiles a program at its first draw, up to 10 s for the largest: SwiftShader's
   longest task fell from 54 s to that), and stops if a flight starts. Start waits for this,
   with progress. The first flight frame still makes the cabin reflection capture. Menu bytes are unchanged (13.94 MB high, 8.54 MB low);
   the scenery prepared behind it is 52.54 MB high and 14.97 MB low (`test/delivery.mjs`).
2. **The airport shadow map was redrawn every 12 m.** The nearby-tree selector requested it on
   every refresh, about 6 times a second on final, even with no 3D tree in view. It is now
   requested when the set of shadow-casting trees changes, at most once a second.
3. **The flight deck's shadow pass drew a million triangles a frame.** Half were modeled
   lettering, flush with the panels. Lettering and parts under 3 cm no longer cast; on rendered
   views 0.08% of pixels change, around the thrust-lever knob lettering.
4. **Adaptive resolution settled into judder.** It stepped down only below 40 fps and up above
   55 fps, so on the M2 it climbed past 1× and stayed at 40–55 fps, which on a 60 Hz screen
   alternates 16.7 and 33 ms frames. Desktop auto mode now holds 60 fps: steps down above 17.5 ms
   (2 s average), keeps a step up only if the following 2 s stay clean, and switches the high
   tier's effects off before going below 1×. Phones keep their thresholds. Modelled in
   `test/graphics-quality.test.mjs`.

The frame rate on the M2 itself is to be confirmed on that machine.
