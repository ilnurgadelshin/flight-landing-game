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
measurement is incomplete or p90 exceeds 22.5 ms. Continued adaptive resolution and a
low-effects fallback respond to sustained slow flight after scenery loads. Explicit
`?quality=high` retains the user's fixed tier. The benchmark above explicitly selects
tiers/scales; a separate browser check verifies that deliberately slow RAF cadence selects
low, leaves scenery registered to the rendered terrain and never loads high-tier trees.

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
