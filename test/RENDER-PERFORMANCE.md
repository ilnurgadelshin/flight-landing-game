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
