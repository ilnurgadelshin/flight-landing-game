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

## Remote performance changes — 2026-10-01

The following measurements and diagnosis were supplied with remote commits `858f9d5` /
`e0b0b69`, before integration with the authored facade/tree work. The integration section
below records the local M2 measurements and corrections.

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
   alternates 16.7 and 33 ms frames. Desktop auto mode now targets 60 fps: steps down above 17.5 ms
   (2 s average), keeps a step up only if the following 2 s stay clean, and switches the high
   tier's effects off before going below 1×. Phones keep their thresholds. Modelled in
   `test/graphics-quality.test.mjs`.

At the time of those remote commits, hardware frame rates on the M2 had not been measured.


## Authored facades, gate halls and mature trees — 2026-10-01

Baseline is `e5cc6ed`, including the preceding cloud/vegetation optimization. The intermediate
snapshot contains only the new facade kits and airport halls; the final snapshot also includes
two new broadleaf forms and repaired alpha masks in all nearby tree models. Reports are
`benchmarks/2026-10-01-architecture-{before,stage,final}.json`. All runs use the same Apple
M2 Pro, Chromium 141.0.7390.37 / ANGLE Metal, 1440×900 CSS, **high 1.5× / low 1×**, four-second
warm-up and twelve-second sampling per scene. GPU tests run sequentially; all optional assets
are loaded and physics is paused in this first comparison.

| High scene | Before FPS | Architecture FPS | Final FPS | Final p95 |
| --- | ---: | ---: | ---: | ---: |
| Captain | 41.5 | 41.4 | 42.1 | 33.4 ms |
| Nearby | 52.6 | 53.9 | 55.3 | 33.3 ms |
| Storm | 44.4 | 44.8 | 44.5 | 33.4 ms |

Low stays at the 60 Hz ceiling, with p95 16.7–16.8 ms. Differences of a few FPS are within
normal variation and do not prove an optimization. Captain draw calls rise from 938 to 947,
with 2.45 → 2.63 million submitted triangles. The nearby view rises from 408 to 420 calls,
but triangles fall from 2.10 to 1.48 million: the new, cheaper broadleaf forms replace some
of the heavy original trees, allowing 32 visible instances versus 21 within the same budget.
That comparison therefore measures different geometry, not just more species at equal cost.

### Real-time flight with normal streaming

`test/streaming-flight.mjs` runs a complete clear-weather short-final autoland at actual
1× time, including physics, instruments and normal deferred scenery. Both runs use a fresh
private browser/context, cold browser resource cache, 1440×900 and forced high at **fixed 1×**
with adaptive resolution disabled. This differs from the 1.5× warmed benchmark above.
Localhost tests transfer/decode/upload behavior, not Internet download speed; the OS file
cache is not cleared. Reports are `benchmarks/2026-10-01-streaming-{before,after}.json`.

| Metric | Before | Final |
| --- | ---: | ---: |
| Duration | 126.02 s | 125.88 s |
| Average FPS | 57.98 | 57.92 |
| p95 frame | 16.8 ms | 16.7 ms |
| p99 frame | 16.8 ms | 16.8 ms |
| Worst frame | 1,183.4 ms | 1,133.3 ms |
| Frames over 50 ms | 13 | 13 |
| Frames over 100 ms | 11 | 12 |
| Landing result | 100 / A, success | 100 / A, success |

The largest stalls occur in the first four seconds, while scenery arrives. Near-tree
requests start at 2.81 s before / 3.32 s after in this short approach. Further 167–217 ms
frames occur during descent as detail tiles change. Resource timing records overlap these
pauses, but do not isolate JavaScript, decoding, shader compilation or GPU-upload cost.
**Streaming stalls remain unresolved**, despite the approximately 58 FPS average. This test
makes them visible rather than treating the warmed scene as complete performance evidence.

### Delivery cost

`benchmarks/2026-10-01-architecture-delivery.json` records actual resource body bytes:

| Tier | Until menu | With scenery | Including near trees |
| --- | ---: | ---: | ---: |
| High | 13.94 MB | 37.09 MB | 51.49 MB |
| Low | 8.54 MB | 14.02 MB | 14.02 MB |

Both facade kits together add 2.51 MB high / 0.67 MB low, requested after flight starts.
The two new nearby trees add 2.73 MB; restoring leaf alpha in the old three adds 0.94 MB.
The nine-form atlases total 1.21 MB versus 0.83 MB for seven forms. Total streamed high-tier
body bytes rise by approximately 6.42 MB from the preceding 45.07 MB measurement. No near-tree
GLBs load on low. The download test still passes startup budgets and hidden-tab/slow-device
quality selection. These are resource body sizes, excluding the main HTML and HTTP overhead.
Neither these runs nor the low tier on this Mac establish performance on a phone, an ordinary
laptop, another graphics driver or the unavailable local SwiftShader backend.


## Remote performance integration — reviewed 2026-10-02

Remote main advanced from `e5cc6ed` to `858f9d5` and `e0b0b69`. The comparison here keeps
all local authored facades, terminal halls, nine canopy forms and repaired leaf alpha on
both sides; only the remote performance work and the integration corrections differ.
The baseline was preserved before pulling. No assets or cockpit shell geometry were removed.

The optimizations fit the renderer's implementation: the airport shadow map is static,
most cockpit lettering does not need a shadow-casting pass, and shaders/textures previously
arrived during flight. Desktop auto mode's 60 FPS target is also reasonable as a pacing
policy; it may trade high-tier effects for smoother frames, with explicit quality overrides
still available. It is a target, not a guarantee on every device or display.

Two corrections were needed:

- Shadow invalidation must include **tree fade changes**, not only changed instance IDs.
  Both the visible and depth shaders use the fade. A regression reproduced unchanged
  membership with no completed-fade shadow refresh on the remote code. The integration
  refreshes at the same one-second limit (1.017 s in the test), then stops redrawing once
  trees settle.
- A cancelled warm-up still compiled its first object, and asynchronous compilation could
  finish after Start's timeout. Check cancellation before beginning and after that await.
  The test now submits zero work when already cancelled and verifies renderer/object state
  restoration. A held-asset UI test verifies duplicate Start suppression and that delayed
  preparation does not warm the scene after the timeout has released the flight.

The delivery check now expects the local **nine tree forms / five source models**. Lighting
checks await menu preparation before inspecting captures; archived comparison helpers retain
support for the former loader. Documentation no longer promises stall-free rendering.

### Matched hardware measurements

Apple M2 Pro, Chromium 141.0.7390.37 / ANGLE Metal, sequential private-browser runs. Warmed
scenes use 1440×900 CSS, high **1.5×**, low **1×**, four seconds warm-up and twelve seconds
sampling, with physics paused. Reports: `benchmarks/2026-10-02-merge-render-{before,after}.json`.

| High scene | Before FPS | Integrated FPS | Integrated p95 |
| --- | ---: | ---: | ---: |
| Captain | 40.6 | 40.6 | 33.4 ms |
| Nearby | 51.2 | 54.2 | 33.3 ms |
| Storm | 43.5 | 44.9 | 33.4 ms |

All low scenes remain near 60 FPS. Captain draw calls fall from 947 to 917; submitted
triangles fall from 2,626,954 to 2,040,609 (586,345 fewer, about 22%). This is a real reduction
in work, but the captain view's measured FPS is unchanged. Nearby/storm gains are modest;
these short samples are not isolated GPU timings or evidence of high-tier 60 FPS.

### Complete flight through the real Start handler

Both runs use cold browser resource caches and the same clear-weather short-final autoland,
1440×900 at forced high **fixed 1×**, with real-time physics and adaptive scaling disabled.
Start is invoked immediately after the menu becomes available. Start wait ends at the first
observed in-flight RAF; frame intervals begin after that observation, including normal frame
work and tile changes. Reports: `benchmarks/2026-10-02-merge-flight-{before,after}.json`.

| Metric | Local scenery before integration | Integrated |
| --- | ---: | ---: |
| Start → first flight frame | 0.60 s | 5.73 s |
| Average FPS | 57.68 | 59.39 |
| p95 / p99 frame | 16.8 / 16.8 ms | 16.7 / 16.8 ms |
| Worst recorded interval | 1,216.6 ms | 183.3 ms |
| Intervals over 100 ms | 13 | 8 |
| Resource requests begun during flight | 69 | 0 |
| Landing | success, 100/A | success, 100/A |

Preparation removes the multi-second cluster of asset-arrival stalls from the flight, by
moving much of that work behind the menu. It does **not** remove all stalls: tile decoding,
GPU uploads and scenario/cabin work still produce approximately 183 ms intervals. Localhost
wait times do not predict Internet download speed, mobile performance or a cold OS cache.

The delivery check measures **13.95 MB high / 8.54 MB low** until the menu, and **58.96 MB
high / 15.80 MB low** after full preparation. All sixteen compressed ground files now load
before Start, while only four decoded textures remain resident on the GPU. This is more
up-front transfer than the previous staged check (which included only the current tile set).
It does not mean the complete flight downloads more: the two actual high flights recorded
60.61 MB before versus 59.12 MB after, with the new compressed-file cache avoiding repeated
tile requests. HTML and HTTP overhead are excluded; flight sound is disabled in this check.

Validation on Metal: all Node suites; the new performance-integration regression; both-tier
approach and authored-scenery checks including missing assets; delivery and slow/hidden-tab
quality selection; **139 browser checks** covering menu, school, landing, mobile/controller
controls and graphics; and the cockpit lighting/capture suite. The full 270-check suite was
not rerun. SwiftShader remains unavailable on this local machine.


### Desktop automatic quality on a Retina-sized viewport

A further complete flight uses the same M2 Pro at 1440×900 CSS with device pixel ratio **2**
and desktop automatic quality enabled. It averages **59.37 FPS**, p95/p99 **16.7/16.8 ms**,
worst **183.3 ms**, with seven intervals over 100 ms and no new flight-time resource requests.
The landing again scores 100/A. Start → first observed flight frame takes 8.10 s in this run.
Report: `benchmarks/2026-10-02-merge-flight-auto.json`.

It **keeps high-tier effects at 1×**, probes 1.1× after 18.04 s, and returns to 1× after
20.08 s because the probe misses the pacing target. There are no further oscillations or
effect reductions in this flight. This verifies the intended policy on this machine, with
a visible tradeoff: automatic Retina rendering is softer than forced 1.5×, which still
renders the captain view at roughly 41 FPS. Explicit high/DRS overrides remain available.


## Ground detail tiles during a flight — 2026-10-02

The M2 flight recordings above (`2026-10-02-merge-flight-*.json`) put every remaining 167–183 ms
frame at x ≈ 8.3, 7.4, 6.4, 5.5, 4.4 and 3.5 km: once per kilometre, where the aircraft enters a
new 1,032 m ground detail tile. The tile (2064 px on high, 17 MB of pixels) was uploaded whole at
its first draw, flipped on the way. In Chrome that is main-thread work. Measured here
(SwiftShader, main-thread time of the frame's JavaScript/WebGL calls, without waiting for the GPU;
eight tiles each):

| One tile | Before: the frame that first draws it | After: worst frame of the strips |
| --- | ---: | ---: |
| High, 2064 px | 119–248 ms | 1–7 ms, with occasional ~40 ms |
| Low, 1032 px | 26–37 ms | 0.4–1 ms |

A tile is now decoded off the main thread (`createImageBitmap`), copied unflipped into a
preallocated texture one sixteenth per animation frame (the last strip builds the mip chain,
about 0.1 ms) and swapped in complete; the ground shader samples the unflipped layout. The
menu preparation holds the short final's four tiles (it held 7/8 rather than 8/9 before, so
two arrived at that start); a jump of more than a kilometre copies at once. The first upload of
this kind in a page has a one-time cost (seconds in software), paid by that preparation.
Rendered ground views on both tiers are identical to the previous build (largest difference
one colour level). With software rendering the GPU-side work is deferred by the
driver and done when the tile completes, so SwiftShader cannot show the GPU half; measuring
the flight on the M2 (`VISUAL_GPU=metal node test/streaming-flight.mjs`) is the confirmation
that was still outstanding then; the complete-flight follow-up below supplies it.

## Complete valley farm and ground-tile flight follow-up — 2026-10-05

The baseline is `f9ba6f8`, including the strip-based ground upload and the latest physics
fixes. This pass replaces three whole farm buildings and their yard, keeping the footprint
and woodland exclusion data. The new models have 25,316 triangles in seven material batches;
the gravel yard adds 2,924 triangles and one batch. The three old facade assemblies and
procedural roofs are omitted only after the complete replacement loads successfully.

The high asset set is **1,651,830 bytes**, the low set **860,814 bytes**, including the yard's
colour, normal and roughness maps (plus a small shared source/placement manifest). Preparation
still happens behind the menu. The rest of the scenery and cockpit are unchanged.

Same Apple M2 Pro, Chromium 141 / ANGLE Metal, 1440×900. Each fixed scene has four seconds
of warm-up and twelve seconds of samples. High is forced to 1.5×; low is 1×. Samples are
display-capped RAF pacing, not uncapped GPU throughput. Reports:
`benchmarks/2026-10-05-farm-render-{before,after}.json`.

| Fixed scene | Before FPS | After FPS | Draw calls before → after |
| --- | ---: | ---: | ---: |
| High captain | 39.89 | 39.72 | 917 → 924 |
| High nearby farm | 51.26 | 50.27 | 420 → 427 |
| High storm | 43.03 | 42.72 | 911 → 918 |
| Low captain | 60.00 | 60.00 | 523 → 530 |
| Low nearby farm | 60.00 | 60.00 | 280 → 285 |
| Low storm | 60.00 | 60.00 | 501 → 508 |

The near view is about 2% slower in this paired run. This is a bounded cost for one site,
not evidence that many more sites would be free. High at forced 1.5× still falls short of
60 FPS in the cockpit; the automatic resolution policy remains important. These measurements
do not establish performance on ordinary laptops or phones.


The full-flight runs use the actual UI Start, fresh browser resource caches, fixed high 1×,
real-time autoland and the same seed, through rollout. Both land successfully with no
asset or JavaScript errors. Reports: `benchmarks/2026-10-05-farm-flight-{before,after}.json`.

| Complete flight | Before | After |
| --- | ---: | ---: |
| Average FPS | 59.90 | 59.89 |
| 99th-percentile frame | 16.8 ms | 16.8 ms |
| Worst interval, at startup | 183.3 ms | 166.7 ms |
| Worst later interval | 50.0 ms | 33.4 ms |
| Intervals over 100 ms | 1 | 1 |
| Start wait on localhost | 5.36 s | 5.30 s |
| Prepared resource bodies | 59.15 MB | 60.81 MB |
| Requests begun during flight | 0 | 0 |

This also confirms the strip-upload optimization on hardware: the repeated large
kilometre-boundary stalls from the older recordings were absent in these two flights.
The differences between 183/167 ms and 50/33 ms are not attributed to the farm change.
Startup still has a visible pause; long-distance imagery stays soft; network preparation
on a real connection will take longer than these localhost results. The unchanged 59.9 FPS
at 1× does not imply 60 FPS at Retina 1.5×.


The delivery check also passes: menu-started resource bodies total **13.98 MB high / 8.58 MB
low**, within the existing 15/9 MB limits. Complete prepared scenery is **60.65 MB high /
16.69 MB low** in that check (the full-flight recording includes its additional detail tiles).
No farm assets are requested before the menu, no requests begin after a prepared Start,
and hidden/slow-tab automatic quality selection still passes. Report:
`benchmarks/2026-10-05-farm-delivery.json`.


## Continuous approach ground and woodland — 2026-10-05

Baseline: published farm commit `0f08fcf`. This pass adds a shared land-cover mask and
reallocates the existing tree budget toward interpreted woodland beside final. The mask
and manifest total **73,056 bytes** and prepare behind the menu. Tree/grass scans and near-tree
models are reused. There is one additional data texture sampled by the ground shader, with
surface reconstruction restricted to covered pixels. The 1000 × 425 data texture adds about
1.7 MB on the GPU without mipmaps; CPU planting retains a similar pixel buffer. No new
geometry layer is added.

Both builds use private Chromium 141 / ANGLE Metal on the same Apple M2 Pro, 1440×900,
four seconds warm-up and twelve seconds samples per scene. High is forced 1.5×, low 1×.
No concurrent graphics test was run during measurement. These are display-capped RAF
intervals, not uncapped GPU timings. Reports: `benchmarks/2026-10-05-corridor-render-{before,after}.json`.
The new `BENCHMARK_SCENES=captain,nearby,storm,corridor` option adds a fixed 240 m view over
the changed parcels; the three default scenes and their positions remain unchanged.

| Fixed scene | Before FPS | After FPS | Draw calls before → after |
| --- | ---: | ---: | ---: |
| High captain | 41.61 | 39.81 | 924 → 924 |
| High nearby | 52.19 | 54.01 | 427 → 424 |
| High storm | 44.21 | 42.72 | 918 → 918 |
| High corridor | 55.09 | 53.09 | 630 → 631 |
| Low captain | 60.00 | 60.00 | 530 → 530 |
| Low nearby | 60.00 | 60.00 | 285 → 285 |
| Low storm | 60.00 | 60.00 | 508 → 508 |
| Low corridor | 60.00 | 60.00 | 410 → 410 |

The denser corridor costs about 3.6% in its fixed high view; high captain/storm are about
4.3% / 3.4% lower in this pair. The nearby view improves about 3.5% because the new planting
changes which tree models fall inside the fixed near-detail budget. No repeatability study
was performed; these small differences include run-to-run variation. High 1.5× remains
below 60 FPS, so automatic resolution adjustment remains important. Low is display-capped
at 60 FPS on this Mac; this does not establish phone or ordinary-laptop performance.

The full-flight baseline is the completed farm recording at the same commit, fixed high
1×, real-time autoland with seed 11 through UI Start and rollout. The after recording uses
the same script and settings with a cold resource cache. Localhost Start timing includes
preparation but does not represent an Internet connection. Reports:
`benchmarks/2026-10-05-corridor-flight-{before,after}.json`.

| Complete flight | Before | After |
| --- | ---: | ---: |
| Average FPS | 59.89 | 59.88 |
| 99th-percentile frame | 16.8 ms | 16.8 ms |
| Worst interval, at startup | 166.7 ms | 183.3 ms |
| Worst later interval | 33.4 ms | 33.4 ms |
| Start wait on localhost | 5.30 s | 5.22 s |
| Prepared resource bodies | 60.81 MB | 60.89 MB |
| Requests begun during flight | 0 | 0 |

Both flights land successfully with score 100/A, without JavaScript or asset errors.
The startup pause remains; its small difference is not attributed to this scenery pass.
The unchanged 1× pacing does not imply unchanged cost at 1.5×. No new downloads are required
in flight because the small mask follows the existing menu preparation policy.

The delivery/automatic-quality regression passes: menu-started resource bodies are
**13.99 MB high / 8.58 MB low**, within the unchanged 15/9 MB limits.
Fully prepared scenery in that check is 60.73 MB high / 16.77 MB low,
with no optional land-cover assets before the menu and no requests after a prepared Start.
Report: `benchmarks/2026-10-05-corridor-delivery.json`.

All 14 Node suites pass, including the new mask registration, airport clearance, coverage
and transfer checks. Chromium Metal checks pass for the corridor on both tiers, visible
ground-material changes, zero tree intrusions in mapped fields/buildings/roads, the missing
mask fallback, existing approach scenery/streaming, vegetation/weather, authored buildings,
delivery/automatic quality and all 23 graphics checks. Planting results are saved in
`benchmarks/2026-10-05-corridor-scenery.json`. The full functional browser suite was not rerun
for this scenery pass. SwiftShader remains unavailable on this machine, so these browser
results validate the hardware renderer only.


## Tree transitions and extended woodland — 2026-10-06

Baseline: published `e26bc15`. Eight-direction images baked from the delivered geometry,
selection hysteresis and one retirement fade step per frame improve vegetation transitions.
The shared mask extends to four kilometres. Total tree instances and near-geometry budgets
are unchanged. New atlas bodies are 1,845,660 bytes high / 543,018 low; land cover is 111,199
bytes. Compared with the baseline, these assets add approximately **1.17 MB high / 85 KB low**.
They remain part of menu preparation, not initial menu display. Near-tree GLBs are unchanged.

The 192/96 px frames limit atlas texel growth to 12.5%: approximately 42.5 MB high / 10.6 MB
low for RGBA8 including the mip chain, versus 37.7 / 9.4 MB before. The data mask's GPU
allocation grows from about 1.7 to 3.4 MB without mipmaps, plus a similar CPU pixel buffer.
World quads still cost two triangles and four texture samples each.

Fresh paired runs on Apple M2 Pro, Chromium 141 / ANGLE Metal, 1440×900, four-second warm-up
and twelve-second samples, high forced 1.5× / low 1×. No other GPU work ran during timing.
These are display-capped RAF intervals; small differences include run-to-run variation.
The extension view is at (5950,240,950), looking at (4250,40,300). Reports:
`benchmarks/2026-10-06-vegetation-render-{before,after}.json`.

| Fixed scene | Before FPS | After FPS | Draw calls before → after |
| --- | ---: | ---: | ---: |
| High captain | 39.56 | 40.28 | 924 → 924 |
| High nearby | 52.60 | 54.43 | 424 → 421 |
| High storm | 42.05 | 42.30 | 918 → 918 |
| High corridor | 51.93 | 52.94 | 631 → 630 |
| High extension | 51.01 | 50.43 | 763 → 762 |
| Low captain | 60.00 | 60.00 | 530 → 530 |
| Low nearby | 60.00 | 60.00 | 285 → 285 |
| Low storm | 60.00 | 60.00 | 508 → 508 |
| Low corridor | 60.00 | 60.00 | 410 → 410 |
| Low extension | 60.00 | 60.00 | 460 → 458 |

There is no material measured frame-rate regression in this pair. The extension is about
1.1% slower at high 1.5×; the other high views are slightly faster. These measurements do
not establish performance on other laptops or phones, and high 1.5× still cannot hold
60 FPS in the cockpit.

`test/tree-transitions.mjs` compares isolated image/geometry silhouettes on a four-sample
render target and renders a fixed 360-step, 420 m path. It records a WebM and three matched
frames, counts detail-selection entries/exits and verifies per-frame fade bounds. Across
the sixteen sampled orientations, average silhouette IoU changes from 0.269 to 0.397.
The route records 277 → 216 entries/exits and the retirement fade's maximum decrement
changes from 0.0952 to 0.0476 per update. This is diagnostic coverage of four forms at four
rotations, not a comprehensive silhouette/lighting or perceptual-quality score. Reports:
`benchmarks/2026-10-06-tree-transitions-{before,after}.json`.


The complete landing uses the same fixed high 1× settings, seed 11 and actual UI Start
preparation policy as the prior corridor recording. The baseline is the completed recording
at `e26bc15`, saved in `benchmarks/2026-10-05-corridor-flight-after.json`; the new cold-cache
recording is `benchmarks/2026-10-06-vegetation-flight.json`. These localhost timings do not
represent Internet download speeds.

| Complete flight | Published corridor | Updated vegetation |
| --- | ---: | ---: |
| Average FPS | 59.88 | 59.88 |
| 99th-percentile frame | 16.8 ms | 16.8 ms |
| Worst interval, at startup | 183.3 ms | 166.6 ms |
| Worst later interval | 33.4 ms | 49.9 ms |
| Start wait on localhost | 5.22 s | 5.38 s |
| Prepared resource bodies | 60.89 MB | 62.06 MB |
| Requests begun during flight | 0 | 0 |

Both runs finish with a 100/A landing and no JavaScript or asset errors. Two later intervals
reach 49.9 ms in the updated run; average/p99 pacing is unchanged. Startup still has a long
interval, and neither this pair nor the fixed views establish worst-case hardware behavior.

The delivery regression passes with unchanged menu-started bodies of **13.99 MB high /
8.58 MB low**, below the existing 15/9 MB budgets. Fully prepared scenery in that test is
61.89 MB high / 16.86 MB low. The extra atlas and mask remain deferred until preparation;
no optional scenery is requested before the menu and no assets are requested after a
prepared Start. Hidden-tab and automatic-quality checks pass. Report:
`benchmarks/2026-10-06-vegetation-delivery.json`.

All 14 Node suites pass. Chromium Metal checks pass for both corridor tiers, field/building/
road clearance, visible ground changes, missing-mask fallback, moving trees, existing
approach streaming/model fallbacks, vegetation/weather, authored scenery, delivery and all
23 graphics checks. Extended planting counts are in `benchmarks/2026-10-06-extended-corridor.json`.
The full functional browser suite was not rerun. SwiftShader cannot initialize WebGL2 on
this machine; software-renderer and other-device performance remain unverified.


## Connected roadside buildings and grounds — 2026-10-07

Baseline: published `0597454`. The original farm expands from three to nine complete buildings,
with matching lawns, yards, drives, a local lane, fences and 14 placed trees. Existing source
footprints remain; architecture and some estimated heights are interpreted. Normal-mapped
clapboard/roof relief replaces thin raised strips after visual inspection exposed bright
subpixel lines. Buildings contain 47,473 triangles, new grounds/fences 39,844 and the original
yard 2,924. Nine building-material batches plus five ground/fence batches give 14 before
subtracting the replaced facade geometry. The narrow lane uses a terrain-following ribbon;
unused parcel-grid vertices are discarded before upload. Overall tree budgets are unchanged.

Delivered farm GLBs are 1,406,404 bytes high / 961,224 low, an increase of 426,460 / 426,128
bytes; new site data adds 6,501 bytes. Existing gravel, grass and asphalt maps are reused.
Including runtime code/data changes, fully prepared resource bodies increase by approximately
**0.446 MB on either tier**. No new third-party download or license is introduced. New relief
maps are embedded in the GLBs; assets load during menu preparation.

Fresh paired fixed-view runs on Apple M2 Pro, Chromium 141 / ANGLE Metal, 1440×900, high
forced 1.5× / low 1×, four-second warm-up and twelve-second samples. The updated run was
followed by the full flight and a refreshed published baseline; no other GPU tests ran
concurrently. These are display-capped RAF intervals, not uncapped GPU throughput, and small
differences include normal run variation. The site camera is at (2670,24,500), looking at
(2600,3,433). Reports: `benchmarks/2026-10-07-roadside-render-{before,after}.json`.

| Fixed scene | Before FPS | After FPS | Draw calls before → after |
| --- | ---: | ---: | ---: |
| High captain | 39.64 | 39.64 | 924 → 930 |
| High nearby | 54.43 | 51.61 | 421 → 431 |
| High storm | 42.69 | 42.44 | 918 → 924 |
| High site | 44.77 | 50.52 | 395 → 396 |
| Low captain | 60.00 | 60.00 | 530 → 533 |
| Low nearby | 60.00 | 60.00 | 285 → 289 |
| Low storm | 60.00 | 60.00 | 508 → 511 |
| Low site | 60.00 | 60.00 | 257 → 260 |

Captain pacing is effectively unchanged and the storm view changes by less than 1%. The
nearby farm view is **5.2% slower** at high 1.5× (54.43 → 51.61 FPS). Its rendered triangles
increase from 1.14 to 2.28 million: revised tree positions change which nearby models enter
the existing bounded 3D selection, in addition to the site geometry. The new site view is
faster (44.77 → 50.52 FPS), where lawn/yard clearance removes formerly misplaced trees.
This is a local tradeoff, not a general renderer speedup. All four low views remain at the
60 FPS display cap. High 1.5× still does not sustain 60 FPS in the cockpit.

A cold-cache full landing through the actual UI Start uses high at fixed 1×, seed 11 and
real-time physics. The published vegetation flight is the prior baseline, not a newly timed
flight. Both complete with 100/A and no asset or JavaScript errors. Localhost preparation
timing is not an Internet download measurement. Reports:
`benchmarks/2026-10-06-vegetation-flight.json` and `benchmarks/2026-10-07-roadside-flight.json`.

| Complete flight | Published vegetation | Updated roadside site |
| --- | ---: | ---: |
| Average FPS | 59.88 | 59.88 |
| 99th-percentile frame | 16.8 ms | 16.8 ms |
| Worst interval, at startup | 166.6 ms | 183.4 ms |
| Worst later interval | 49.9 ms | 49.9 ms |
| Start wait on localhost | 5.38 s | 5.25 s |
| Prepared resource bodies | 62.06 MB | 62.50 MB |
| Requests begun during flight | 0 | 0 |

The startup hitch is not eliminated. The earlier dense-grid site draft took 7.22 seconds
at Start in its local trial; after the road ribbon and geometry cleanup, the final trial
is 5.25 seconds. This is a diagnostic observation, not an isolated causal benchmark.

Delivery checks pass: menu bodies **14.00 MB high / 8.60 MB low** remain below 15/9 MB;
fully prepared scenery is 62.34 MB high / 17.30 MB low. Site assets remain deferred until
preparation and no assets are requested after prepared Start. Automatic quality and hidden-tab
checks pass. Report: `benchmarks/2026-10-07-roadside-delivery.json`.

All 14 Node suites and the stronger normal-map UV checks pass. Hardware browser checks pass
for all nine roofs, terrain contact, road connections, garden planting/clearance, visible ground
replacement, missing site/model/texture fallbacks, existing approach streaming, corridor,
delivery and all 23 graphics checks. Reports: `benchmarks/2026-10-07-roadside-{site,assets,planting}.json`.
The full functional browser suite was not rerun. Other computers/phones are not benchmarked,
and SwiftShader cannot initialize WebGL2 here. Matched stills and captain-eye recordings are
available in the local `output/roadside-site-review.html`.


## Opposite-side approach ground and woodland — 2026-10-07

Baseline: published `fec4cb3`. Twenty-three additional interpreted parcels extend reconstructed
fields and woodland along 2 km opposite the existing 4 km region. Total weighted surface
coverage rises from about 203.77 to 296.00 hectares. The original mask region's 2,550,000
channel values are unchanged. Independent planting seeds/allocations retain its mapped canopy;
5,500 high / 2,600 low trees are assigned to the new region from the wider photographic
planting. Overall budgets remain 52,000 / 14,000. Current mapped stands use 15,377 / 7,281
instances, plus the existing 14 site trees. Wider background placement and tints can change.

The PNG/JSON pair grows from 111,199 to **228,509 bytes** (+117,310), below its new 250 KB
budget. Including runtime code, prepared resource bodies increase **118,655 bytes** per tier.
All imagery/materials/tree models are reused. The mask remains 2 m/px, at 2000×1015 over
4 km×2.03 km combined bounds, including unmapped gaps. Its unmipmapped RGBA8 GPU allocation
and retained CPU sampling buffer each grow from 3.40 to 8.12 MB (+4.72 MB each). There is
still one shader mask lookup and no extra ground draw call, but more visible pixels/trees
now receive the treatment. The new region must not be interpreted as free rendering work.

Fresh paired runs on Apple M2 Pro, Chromium 141 / ANGLE Metal, 1440×900, fixed high 1.5× /
low 1×, four-second warm-up and twelve-second samples. Published and updated builds ran
sequentially with no concurrent GPU tests. These are display-capped RAF intervals, not
uncapped GPU throughput. The opposite camera is (4040,250,-910), looking at (2810,35,-475).
Reports: `benchmarks/2026-10-07-opposite-render-{before,after}.json`.

| Fixed scene | Before FPS | After FPS | Draw calls before → after |
| --- | ---: | ---: | ---: |
| High captain | 38.84 | 38.20 | 930 → 932 |
| High nearby | 50.76 | 49.77 | 431 → 428 |
| High storm | 41.19 | 40.69 | 924 → 926 |
| High corridor | 51.18 | 50.60 | 636 → 637 |
| High opposite | 55.84 | 51.10 | 648 → 647 |
| Low captain | 60.00 | 60.00 | 533 → 533 |
| Low nearby | 60.00 | 60.00 | 289 → 289 |
| Low storm | 56.92 | 57.67 | 511 → 511 |
| Low corridor | 60.00 | 60.00 | 413 → 413 |
| Low opposite | 60.00 | 60.00 | 414 → 414 |

High cockpit pacing decreases about 1.7%; the other pre-existing high views decrease about
1–2%. Such small differences include run-to-run variation. The expanded opposite view costs
**8.5%** at high 1.5× (55.84 → 51.10 FPS), the clearest measured tradeoff for substantially
more canopy. All clear-weather low scenes stay at the 60 FPS cap. Low storm runs around
57 FPS on both builds in this pair, rather than the 60 FPS reached in earlier measurements;
this pass does not establish a storm regression. Other computers and phones are unbenchmarked.

The final cold-cache full landing uses high fixed 1×, seed 11 and actual UI Start preparation.
The earlier published roadside landing is the comparison, not a newly timed baseline flight.
Both finish with 100/A and no JavaScript or asset errors. Reports:
`benchmarks/2026-10-07-roadside-flight.json` and `benchmarks/2026-10-07-opposite-flight.json`.

| Complete flight | Published roadside site | Expanded approach |
| --- | ---: | ---: |
| Average FPS | 59.88 | 59.91 |
| 99th-percentile frame | 16.8 ms | 16.8 ms |
| Worst interval, at startup | 183.4 ms | 200.0 ms |
| Worst later interval | 49.9 ms | 33.4 ms |
| Start wait on localhost | 5.25 s | 5.79 s |
| Prepared resource bodies | 62.50 MB | 62.62 MB |
| Requests begun during flight | 0 | 0 |

The larger mask and planting add preparation work. Startup remains visibly stalled in this
measurement, and localhost timing does not predict Internet download speeds. Mean/p99 flight
pacing remains near the display cap; neither this run nor the fixed views establish worst-case
performance across devices or weather scenarios.

Delivery checks pass: menu bodies **14.00 MB high / 8.60 MB low** remain under the 15/9 MB
budgets; fully prepared scenery is 62.46 MB high / 17.42 MB low in the delivery test. Expanded
cover stays deferred until preparation, and no assets are requested after prepared Start.
Automatic-quality and hidden-tab checks pass. The known mask boundary is compared byte-for-byte
in `benchmarks/2026-10-07-opposite-mask.json`; planting, clearances and ground pixels are in
`benchmarks/2026-10-07-opposite-scenery.json`. Site and delivery reports use the same prefix.

All 14 Node suites pass. Chromium Metal passes both corridor tiers, mapped field/building/road
clearance, ground visibility, missing-mask fallback, existing approach streaming, all nine site
roofs and 14 garden trees, vegetation/weather including corrupt density fallback, delivery and
23 graphics checks. The full functional browser suite was not rerun; SwiftShader remains
unavailable here. Matched stills, normal cockpit views and costs are in the local
`output/opposite-approach-review.html`. Very low ground still lacks grass/crop geometry, and
photographic blur/shadows remain outside the interpreted parcels.


## Runway shoulder and pavement finish — 2026-10-08

Baseline: published `c9b53bd`, archived into a temporary directory. Both builds were measured
sequentially on Apple M2 Pro / Chromium 141 / ANGLE Metal, 1440×900, high fixed 1.5× and low
fixed 1×, four-second warm-up and twelve-second samples. The added `shoulder` scene uses
(1250,3.7,-29) looking at (1120,1,-41). `rollout` uses the ordinary captain camera with an
on-ground aircraft at x=1000. Existing captain and storm views remain unchanged.
Reports: `benchmarks/2026-10-08-runway-render-{before,after}.json`.

| Fixed scene | Before FPS | After FPS | Draw calls before → after |
| --- | ---: | ---: | ---: |
| High captain | 38.48 | 39.42 | 932 → 931 |
| High rollout | 41.83 | 41.55 | 703 → 702 |
| High shoulder | 59.09 | 58.01 | 407 → 406 |
| High storm | 42.05 | 41.94 | 926 → 925 |
| Low captain | 60.00 | 60.00 | 533 → 532 |
| Low rollout | 60.00 | 60.00 | 401 → 400 |
| Low shoulder | 60.00 | 60.00 | 286 → 285 |
| Low storm | 59.92 | 59.50 | 511 → 510 |

High results range from approximately 2.5% faster to 1.8% slower; the largest observed cost
is the close shoulder view (59.09 → 58.01 FPS). Low views remain approximately 60 FPS. These
small changes include run-to-run variation. This is not evidence of a general performance
improvement, nor a benchmark of phones or other GPUs. These are display-capped RAF timings.

The new shoulder geometry contains 12,000 triangles in one mesh instead of 480 triangles in
two meshes: +11,520 triangles, -1 draw per rendered view. Its position/normal/UV/index arrays
occupy 328,256 bytes instead of approximately 14,496 bytes (+313,760 bytes, both CPU and GPU
geometry buffers before driver overhead). No new texture or model is delivered; the already
loaded asphalt scans are shared. The runway canvas remains 8192×512 where the device allows
it. Additional cost is shader sampling, shoulder blending and the small runtime module.

A rejected grass prototype would have submitted up to 559,872 high / 115,248 low triangles
with roughly 1.49 / 0.31 MB of instance attributes. Rendered exterior review found sparse tufts; the initial
prototype cockpit poses were not adequate for judging its landing-view contribution. It was removed, so none of those costs is in this
benchmark or in the delivered game. No hardware FPS claim is made for that prototype.

The actual UI Start / complete autoland run (high fixed 1×, seed 11, cold browser cache)
finished at 100/A with no JavaScript or asset errors. It averaged **59.87 FPS**, with a
**16.8 ms** p99 frame interval. The worst interval remains **200 ms** at startup; the
worst later interval was **49.9 ms**. Start preparation took **5.62 s** on localhost.
There were **0 requests begun during flight**. Prepared resource bodies were
**62,624,380 bytes**, **3,880 bytes** more than the previous opposite-approach run.
This increase is runtime code, not new imagery or models. The previous recorded flight
was 59.91 FPS / 16.8 ms p99; it was not freshly retimed for this pass. Startup hitching
and Internet/mobile-network behavior are not solved by this surface change.
Report: `benchmarks/2026-10-08-runway-flight.json`.

All 14 Node suites and all 23 graphics browser checks pass. The targeted surface check covers seven matched views
on each tier, upward-facing shoulder triangles, successful use of the shared scans and a
missing-normal-map fallback. Report: `benchmarks/2026-10-08-runway-surfaces.json`.
The full functional browser suite and other GPUs/phones were not tested; SwiftShader
remains unavailable on this machine. Local review: `output/runway-surface-review.html`.


## Two complete opposite-approach sites — 2026-10-08

Baseline: published `89f9691`, archived into a temporary directory. Measurements run
sequentially on Apple M2 Pro / Chromium 141 / ANGLE Metal at 1440×900, high fixed 1.5×
and low fixed 1×, four-second warm-up and twelve-second samples. The new `north-farm`
scene uses (2390,15,-320) looking at (2387,3,-385); `hamlet` uses (3150,14,-310) looking
at (3195,2,-277). Existing captain, opposite and storm scenes are unchanged.
Reports: `benchmarks/2026-10-08-complete-sites-render-{before,after}.json`.

| Fixed scene | Before FPS | After FPS | Draw calls before → after |
| --- | ---: | ---: | ---: |
| high captain | 39.11 | 39.45 | 931 → 931 |
| high north-farm | 54.43 | 52.01 | 200 → 213 |
| high hamlet | 46.81 | 48.68 | 292 → 298 |
| high opposite | 54.51 | 55.26 | 648 → 659 |
| high storm | 42.19 | 42.11 | 925 → 925 |
| low captain | 60.00 | 60.00 | 532 → 542 |
| low north-farm | 60.00 | 60.00 | 117 → 127 |
| low hamlet | 60.00 | 60.00 | 155 → 168 |
| low opposite | 60.00 | 60.00 | 413 → 436 |
| low storm | 60.00 | 52.18 | 510 → 520 |

The close farm view costs **4.4%** at high 1.5× (54.43 → 52.01 FPS). Other high scenes
range from 0.2% slower to 4.0% faster; small differences include run-to-run variation. Clear
low scenes stay at the 60 FPS cap, but low storm falls to **52.18 FPS** in the final series
versus 60 FPS in the earlier after-series. Both reports are retained (the earlier series is
`render-initial.json`); its only subsequent scenery change moves one boundary tree.
These are display-capped RAF measurements, not GPU throughput or evidence of equivalent
performance on phones or other laptops. High cockpit still runs around 39 FPS at forced
1.5×; automatic resolution selection is unchanged.

A focused storm repeat on both builds gives **42.11 → 42.38 FPS high** and
**60.00 → 60.00 FPS low**. Reports: `complete-sites-storm-{before,after}.json` with the
same date prefix. The 52.18 FPS low result was not reproduced, but is retained rather than
discarded. These samples do not establish a persistent storm regression or guarantee 60 FPS.

Seven additional complete models add 11,382 triangles (58,855 total). Grounds/fences increase
from 39,844 to 81,218 triangles; the original 2,924-triangle yard is unchanged. Building
batches stay local to each of the three sites, increasing the complete-sites group from
14 to 38 batches, while replacing more facade-kit/procedural geometry. Actual visible draw
changes are shown above. High/low facade-kit counts decrease from 31/12 to 25/9 because the
new complete models replace those candidates. No building footprint is removed.

High/low GLBs grow by 205,148 / 205,096 bytes, and the shared new site JSON is 16,200 bytes.
That is **221,348 / 221,296 bytes** of additional model/site data, excluding the small
manifest and runtime-code changes. No new source image, texture map or paid asset is added.
The low model/yard/site asset budget increases from 1.5 to 1.6 MB (actual 1,514,739 bytes);
the high 2.4 MB budget is unchanged (actual 2,306,139 bytes). Scenery remains prepared behind
the menu. A failed extension-data download preserves the original complete valley site and
falls back to procedural geometry for the seven new placements.

Delivery checks pass: menu resource bodies are **14.01 MB high / 8.60 MB low** and fully
prepared resources **62.69 MB / 17.65 MB** in the delivery test. Preparation still completes
behind the menu, and its tested flight makes no additional requests. Hidden-tab calibration
and slow-renderer quality selection pass. Localhost timing does not predict Internet downloads.

All 14 Node suites pass. Chromium Metal passes all sixteen roofs, terrain contact within
0.001 m, three new road connections, 27 placed trees and no unplanned trees in the grounds.
Boundary fences leave the new lanes clear. Corridor tests report no trees in mapped fields,
buildings or roads. Missing/invalid extension data retains the original nine-building site;
missing common model, site or yard assets retain procedural geometry. Existing approach
streaming, low/high original-valley views and all 23 graphics checks pass. Reports are saved
with the `2026-10-08-complete-sites-` prefix. The full functional browser suite and other
GPUs/phones were not tested; SwiftShader remains unavailable on this machine.

The final real-time autoland uses the actual UI Start preparation, a cold browser cache,
seed 11 and high fixed 1×. It finishes **100/A at 59.90 FPS**, p99 **16.8 ms**, with no
JavaScript/asset errors and **zero requests begun during flight**. The worst interval is
**166.7 ms at startup**; the worst later interval is **33.4 ms**. Preparation takes **5.67 s**
on localhost. Prepared resource bodies are **62,849,908 bytes**, 225,528 more than the
earlier published runway-flight report (62,624,380). That earlier flight averaged 59.87 FPS,
p99 16.8 ms; it was not freshly retimed for this pass. Startup still hitches, and neither
this clear-weather flight nor the fixed scenes establishes performance on other devices
or all weather scenarios. Report: `benchmarks/2026-10-08-complete-sites-flight.json`.

Local before/after review: `output/complete-approach-sites-review.html`.


## Soft overcast boundaries — 2026-10-08

**Correction, 2026-10-09:** the boundary-fog assessment below missed a regression.
The 60 m altitude-only fringe greyed the whole exterior even outside the cloud; the
comparison slider was correctly labelled. See the cloud-entry correction below for the
replacement, tests that preserve clear outside rays, and new matched captures.

Baseline: published `ab6eb2b`. The overcast top used a flat textured plane and the underside
used a displaced grid. Both now integrate density around a generated periodic height field,
rendered to a bounded, reduced-resolution target, then composite at the cloud boundary.
The interior retains shared atmospheric fog. This is a boundary-volume approximation, not
full volumetric weather. Ordinary captain, exterior, near-boundary, night and storm captures
are available in [the local comparison](output/overcast-review.html).

A generated 256² RGBA field occupies 262,144 bytes before mipmaps (about 341 KiB with them).
It replaces two generated 512² overcast textures. No image/model download is added. High
uses at most 560,000 RGBA8 pixels and 28 density steps; low uses 160,000 pixels and 14 steps.
The target uses no depth attachment or floating-point colour extension. Reversible colour
compression retains highlights before the final display conversion. The density pass is
skipped in clear weather and inside the deck. The texture/target objects are reused during
resizing; reducing quality lowers the target cap and step count without restarting flight.

Cloud entry also exposed an existing fog issue: mixing visibility distances left a 20 km
scenario almost clear just inside cloud (12,048 m visibility at 24 m inside). Blending inverse
visibility fixes that. The 60 m fringe is now centered on each charted boundary, so fog hides
the ground before the surface proxy disappears; visibility at 24 m inside is about 133 m.
Cloud base/top configuration, flight physics, lighting above/below the layer and storm rain
remain in place. Rain draws after the boundary, and the proxy writes depth to prevent runway
lights showing through opaque cloud from above.

Matched hardware run: Chromium 141, ANGLE Metal, Apple M2 Pro, 1440×900; high fixed 1.5×,
low fixed 1×, four seconds warm-up plus twelve seconds of display-paced RAF sampling per
scene. Physics is paused; scenery/weather updates continue. Before/after reports are
`benchmarks/2026-10-08-overcast-render-{before,after}.json`.

| View | Before FPS | After FPS | Before → after draw calls |
| --- | ---: | ---: | ---: |
| High clear captain (control) | 39.78 | 39.56 | 931 → 931 |
| High above deck | 60.00 | 60.00 | 527 → 529 |
| High below deck | 60.00 | 60.00 | 608 → 609 |
| High captain above deck | 45.46 | 46.79 | 924 → 926 |
| High storm interior | 42.13 | 42.05 | 925 → 925 |
| Low clear captain (control) | 60.00 | 60.00 | 542 → 542 |
| Low above deck | 60.00 | 60.00 | 338 → 340 |
| Low below deck | 60.00 | 60.00 | 406 → 407 |
| Low captain above deck | 54.93 | 60.00 | 511 → 513 |
| Low storm interior | 54.18 | 56.34 | 520 → 520 |

These samples show no clear regression, but the 60 FPS cap conceals GPU headroom and the
small increases are not evidence of a speed-up. Low-tier timing varies between runs, as in
the preceding scenery pass. High forced 1.5× remains below 60 FPS in the cockpit. Replacing
the old two-sided underside grid removes about 36,858 submitted triangles in its exterior
view; the new cost is a density pass plus screen texture sampling. The storm interior skips
this pass; the exterior storm screenshot separately exercises its underside and rain order.

The real-time crosswind short approach through the actual UI Start completes successfully
at **84/B, 59.89 FPS**, p99 **16.8 ms**, high fixed 1×. It makes **zero requests during flight**
and reports no JavaScript or asset errors. Localhost preparation takes **5.21 s**; resource
bodies total **62,854,276 bytes**, 4,368 more than the prior complete-sites clear-flight report.
The worst interval is **199.9 ms at startup**; later intervals peak at **33.4 ms**. Startup
still hitches. This flight begins below the cloud base; separate rendered checks cover entry
at both boundaries. It is not a matched comparison with the previous clear-weather autoland.
Report: `benchmarks/2026-10-08-overcast-flight.json`.

Validation: all 14 Node suites, all 23 browser graphics checks, normal display visibility and
missing-cockpit fallback, both-tier rendered cloud-transition checks, and warm-up cancellation /
Start-timeout integration checks pass. New cloud checks cover opaque-cloud light occlusion,
nonblack day surfaces, no false floor/ceiling inside, skipped clear/interior passes, resize
resource reuse, quality reduction and offscreen renderer-state restoration. Their report is
`benchmarks/2026-10-08-overcast-rendered-checks.json`.

Delivery/automatic-quality checks also pass: menu resource bodies are **14.01 MB high / 8.61 MB low**, fully prepared resources **62.69 MB / 17.65 MB**. Hidden-tab calibration waits for foreground, a simulated slow renderer selects low, and prepared scenery makes no new flight requests. Report: `benchmarks/2026-10-08-overcast-delivery.json`.

Remaining limits: repeated cloud cells, grain near very close/grazing boundaries, simple
interior fog, and a flat depth boundary rather than terrain/cloud-volume intersections.
The storm view still contains small dark ground patches also present in the baseline. No
windshield water, better ground vegetation or wider authored scenery is part of this pass.
Only this Mac's Metal renderer was measured; the complete functional browser suite, physical
phones and other GPUs were not tested. SwiftShader cannot initialize WebGL2 here.


## Photographed near-ground grass — 2026-10-09

Baseline: published `9f1c625`. New short turf at the runway margins and taller mapped-meadow
grass use two crossed textured planes per patch. Eight photographed CC0 views are baked
offline; no source GLTF is shipped. High adds **154,114 bytes**, low **50,808 bytes**. Each
atlas is prepared behind the menu. Missing imagery retains the existing ground.

A fixed 9×9 pool of 10 m tiles contains 32,400 patches high / 15,876 low, updated two tiles
per frame. It submits one extra draw and at most **129,600 / 63,504 triangles**, including
collapsed empty slots. Instance arrays occupy **1,036,800 / 508,032 bytes**, plus small shared
geometry; RGBA atlas storage is about **1.33 MiB / 0.33 MiB with mipmaps**. The range is
40 m high / 36 m low, with both height and coverage fading by three-dimensional eye distance.
No grass shadows are rendered. Quality reduction lowers the instance count and range while
retaining existing arrays and the loaded texture. Hidden empty pools coalesce dirty ranges
into one full upload, avoiding an ever-growing list while they are not rendered.

Matched hardware sample: Chromium 141, ANGLE Metal, Apple M2 Pro, 1440×900. High is fixed
1.5×, low fixed 1×; each view uses four seconds warm-up and twelve seconds display-paced
RAF sampling. Physics is paused; grass, terrain, vegetation and weather continue updating.
The meadow/pasture cameras move 30 m to exercise tile updates. Raw reports:
`benchmarks/2026-10-09-ground-cover-render-{before,after}.json`.

| View | Before FPS | After FPS | Draw calls before → after |
| --- | ---: | ---: | ---: |
| High captain | 38.39 | 38.31 | 931 → 931 |
| High rollout | 40.56 | 40.31 | 702 → 703 |
| High shoulder | 56.42 | 56.09 | 406 → 407 |
| High grass-meadow | 45.13 | 44.94 | 295 → 296 |
| High grass-pasture | 51.36 | 47.35 | 301 → 302 |
| High storm | 40.86 | 42.03 | 926 → 926 |
| Low captain | 60.00 | 60.00 | 542 → 542 |
| Low rollout | 60.00 | 58.75 | 400 → 401 |
| Low shoulder | 60.00 | 60.00 | 285 → 286 |
| Low grass-meadow | 60.00 | 60.00 | 163 → 164 |
| Low grass-pasture | 60.00 | 60.00 | 139 → 140 |
| Low storm | 60.00 | 60.00 | 520 → 520 |

The close high pasture view costs **7.8%** in this run (51.36 → 47.35 FPS); its CPU p95
increases from 3.2 to 6.1 ms, including selection/upload work. The other high views change
by less than 3%. High p95/p99 frame intervals remain about 33.4 ms. Low rollout measures
58.75 instead of 60 FPS, with p99 33.4 ms; the other low views stay at the 60 FPS cap.
The cap conceals GPU headroom and these small timing differences are not evidence of a
speed-up. Forced high 1.5× still falls well below 60 FPS in the cockpit. A three-plane
prototype cost about 18% in the same close pasture; the final two-plane form cuts its
triangle budget by a third without losing the close foreground coverage.

The pixel checks show a strong contribution in close exterior grass views and a small one
when looking through a side window. **The sampled straight-ahead rollout, flare, final and
HUD views show zero changed pixels above an 8-level RGB threshold when grass is toggled.**
This pass improves close terrain detail; it does not improve those ordinary forward landing
views. Repeated patch forms, crossed planes, limited range, flat distant fields and simple
site lawns remain. The before/after captures and separate movement recordings are in
[the local review](output/ground-cover-review.html).

Both-tier rendered checks pass: visible close-ground contribution, terrain contact, a maximum
of two tile uploads per update, unchanged settled buffers, high-to-low reduction, reduction
during an atlas request, bounded dirty ranges while hidden, and missing-atlas fallback.
Report: `benchmarks/2026-10-09-ground-cover-rendered-checks.json`. All 15 Node suites, all
23 graphics checks, cockpit PFD/ND visibility and missing-model fallback, cloud-transition
pixels, tree-shadow refresh and warm-up/Start-timeout integration checks pass on Metal.

Delivery/automatic-quality checks pass: menu bodies **14.02 MB high / 8.62 MB low**, prepared
bodies **62.85 MB / 17.71 MB**. Exactly the selected atlas loads after the menu; the prepared
flight makes no new requests. Hidden-tab calibration waits, and slow foreground cadence
selects low. Report: `benchmarks/2026-10-09-ground-cover-delivery.json`.

Separate 1280×800, fixed 1× recordings exercise eight seconds of pasture motion at 6 m/s
and runway-side motion at 55 m/s. They retain ground coverage with the normal two-tile budget;
the forward queue has seven pending tiles at the end of the fast traverse. High measures
59.63 / 59.75 FPS, p99 16.8 ms, with isolated 66.7 / 50 ms worst frames. Low stays at the
60 FPS cap. Video recording overhead is included, so these are motion checks rather than
matched performance comparisons. Contact sheets show continuous foreground cover, while
repeated patch shapes and the limited range remain apparent. Report:
`benchmarks/2026-10-09-ground-cover-motion.json`.

The real-time clear short landing through UI Start completes at **100/A and 59.92 FPS**,
high fixed 1× at 1440×900. Frame p99 is **16.8 ms**, preparation on localhost takes
**5.59 s**, and the flight starts **zero resource requests**. Prepared bodies total
**63,017,572 bytes**. The startup interval still peaks at **166.7 ms**; the largest later
interval is **50 ms**. This is not a claim that the startup hitch is fixed. Report:
`benchmarks/2026-10-09-ground-cover-flight.json`.

Only this Mac's Metal renderer was measured. The complete functional browser suite, physical
phones and other GPUs were not tested; SwiftShader cannot initialize WebGL2 here. Wider
coherent ground/scenery coverage remains the larger opportunity for ordinary landing views.


## Review fixes: lawns in fog, low-tier grass and gravel — 2026-10-09

Baseline: `5b85f57`. Three follow-ups from reviewing the scenery passes above.

**Valley-site lawns in fog.** The roadside lawns' own shader hook replaced the shared one that
binds the atmosphere's uniforms, so their haze read zero sky terms and the lawns turned
black in fog. In the storm view they averaged 60 against 94 for the surrounding ground; with
the shared hook called first they match at 94. `test/authored-scenery.mjs` now checks every
compiled fogged material on both tiers for those uniforms (192 high, 174 low; none missing).

**Near-ground grass is high-tier only.** It changes no pixels in the sampled straight-ahead
rollout, flare, final and HUD views, and 1,984 (0.15%) looking through a side window, so the
low tier (phones) no longer builds its 15,876 instances or downloads its atlas; the 50,808-byte
low atlas is removed. Automatic quality reduction now releases the grass (mesh, instance
buffers and atlas) instead of shrinking the pool; a reduction while the atlas is still
arriving builds nothing.

**Low gravel maps.** The gravel normal and roughness maps were the same 512 px on both tiers;
low now uses 256 px (149,506 → 29,936 and 50,226 → 9,618 bytes). Prepared low-tier bodies fall
from **17.71 MB to 17.50 MB** (210,986 bytes: atlas plus gravel); high is unchanged
(62,855,186 bytes), and menu bodies stay 14.02 MB / 8.62 MB.

The browser suites added with these passes now default to SwiftShader like the others
(`VISUAL_GPU=metal` on macOS hardware). The grass-motion, tree-transition and valley-site
videos are recorded only on a GPU (`RECORD_VIDEO=1` or `0` overrides): SwiftShader draws a
frame every 9–20 s, so its 8 s "motion" was a single frame. Every check runs either way, the
grass and tree paths stepped at fixed updates, and all three suites complete in software
rendering. All checks named here ran in SwiftShader; no frame rates were measured.

## Cloud-entry correction — 2026-10-09

Baseline: published `5b85f57`. Its global altitude-based fog obscured clear sky even outside
the deck. This correction integrates cloud density along each viewing ray while retaining
ordinary scenario haze. The profile has 32 m ramps inside the boundaries and reaches 95%
obscuration after 120 m at full density. Clipping to each linear band and integrating its
midpoint avoids cancellation when rays skim an edge; CPU and rendered GPU probes cover
horizontal, grazing, outward, crossing and short-exit paths.

There are no new assets or texture fetches. The same 256² generated field and bounded density
target remain: high at most 560,000 pixels / 28 steps, low 160,000 / 14 steps. Clear weather
and the deep interior skip that pass. Near an inner boundary it now continues briefly,
blending into the interior instead of disappearing at 3 m penetration. Those views therefore
retain the density pass and its composite draw. The per-material extinction is analytic, with an early return for
clear weather and rays pointing away from the layer.

Strict clear-ray pixel comparisons disable the tree material's alpha-to-coverage: Metal
rotates its coverage samples across otherwise identical frames. Normal review captures,
recordings and benchmarks retain that antialiasing. The cloud tests also preserve foreground
at 10 m, hide distant lamps deep inside, limit discontinuity across the nominal boundary,
and check that the inner proxy does not draw a hard horizon seam. The existing graphics
lighting test now moves the eye as well as the aircraft state; opacity is validated from
rendered pixels rather than requiring the old global sky-overcast uniform to equal one.

Matched hardware runs use Chromium 141 / ANGLE Metal / Apple M2 Pro, 1440×900,
high fixed 1.5× and low fixed 1×, four seconds warm-up and twelve seconds sampling per
view. Physics is paused, scenery/weather updates continue, and no other GPU test runs
concurrently. These are display-capped frame-pacing samples, not uncapped GPU timings.
Reports: `benchmarks/2026-10-09-cloud-boundary-render-{before,after}.json`.

| View | High FPS before → after | Low FPS before → after | High draw calls before → after |
| --- | ---: | ---: | ---: |
| Clear captain | 39.70 → 38.36 | 60.00 → 60.00 | 931 → 931 |
| 320 m above top | 60.00 → 60.00 | 60.00 → 60.00 | 529 → 529 |
| 12 m above top | 59.50 → 60.00 | 60.00 → 60.00 | 555 → 555 |
| 24 m inside base | 60.00 → 60.00 | 60.00 → 60.00 | 587 → 590 |
| Captain above deck | 46.54 → 45.21 | 60.00 → 60.00 | 926 → 926 |
| Storm captain | 42.13 → 41.64 | 60.00 → 60.00 | 925 → 928 |

The high cockpit samples are 1.2–3.4% lower. This is a small measured difference, not a
speed-up; a single pair does not separate shader cost from run-to-run scheduling/thermal
variation. The near-inner-boundary and storm views add three draws / six triangles from
the density pass and two-sided transparent composite. Other sampled geometry is unchanged.
The 60 FPS exterior/low-tier results demonstrate maintained display cadence, not zero cost
or spare GPU headroom. Other GPUs, software rendering and sustained thermal load have not
been benchmarked for this correction.

The older storm pixel check assumed identical upper/lower grey bands at 24 m inside the
base. A short downward exit can now legitimately differ from the cloud overhead. It instead
checks for a sharp seam at the horizon (less than three display levels per row), bounds the
broad gradient, and retains the distant-light occlusion check. Measured high/low horizon
jumps are 1.11 / 0.07 levels, with light contribution at most two levels on either tier.
The new crosswind test independently requires a grey deep interior and preserves short exits.

All 16 Node suites, all 23 graphics checks, PFD/ND visibility, the missing-cockpit fallback,
both-tier storm-entry checks, warm-up cancellation, duplicate/timeout Start handling and
delivery/automatic-quality selection pass on Chromium Metal. Menu resource bodies are
**14.027 MB high / 8.620 MB low**, fully prepared resources **62.859 MB / 17.718 MB**.
No model/image payload was added. Delivery checks still wait for a foreground calibration,
select low for the simulated slow renderer and make no new prepared-scenery requests in flight.
Reports: `benchmarks/2026-10-09-cloud-boundary-{rays,rendered-checks,delivery}.json`.

Both-tier 1280×800, fixed 1× descent recordings cover entry at the top, the deep interior
and exit at the base, first with an exterior camera and then the captain view. The scripted
vertical path is 24 m/s with paused physics, not an approach flight. Recorded RAF pacing is
59.95–60.00 FPS, p99 16.8 ms; these recordings are visual checks, not a second matched
performance comparison. The flight deck and displays remain visible during the whiteout.
Report: `benchmarks/2026-10-09-cloud-boundary-motion.json`. The local comparison verifies
all 20 before/after image pairs, both quality selectors, full-before/full-after controls
and actual WebM playback. The original comparison carries a link to this correction.

A real-time crosswind short landing through the UI Start handler completes successfully
at **84/B**, high fixed 1× / 1440×900, **59.60 FPS**, p99 **16.8 ms**, with no in-flight
requests and no asset errors. Preparation to the first flight RAF takes 6.08 s on localhost.
This run is **not stutter-free**: it records a 450.1 ms frame at 44.1 s and a 183.3 ms frame
at 95.2 s, plus a 200 ms initial frame. The short start is below cloud base; the separate
recordings cover the actual cloud crossings. Report:
`benchmarks/2026-10-09-cloud-boundary-flight.json`.

A follow-up run of the published `5b85f57` build on the same short-flight path completes at
84/B, **59.89 FPS**, p99 **16.8 ms**. Its worst frame is **183.3 ms at startup**; its largest
mid-flight frame is 33.4 ms. Preparation takes 5.69 s and it makes no flight requests.
The initial corrected run's two mid-flight hitches were not observed on this baseline.
Report: `benchmarks/2026-10-09-cloud-boundary-flight-before.json`.

The corrected build's repeat completes at 84/B, **59.87 FPS**, p99 **16.8 ms**, with a
**216.7 ms startup frame** and a largest later frame of 33.4 ms (excluding the 50 ms frame
immediately after Start). Preparation takes 5.82 s; there are no flight requests or errors.
The two larger mid-flight hitches from the first corrected run do **not** recur. Their cause
has not been established, so both runs are retained rather than discarding the worse one.
The repeat's display cadence is close to the published baseline, while startup stutter and
the small fixed-1.5× cockpit differences remain limitations. Report:
`benchmarks/2026-10-09-cloud-boundary-flight-repeat.json`.


## Cloud/scenery integration — 2026-10-10

Remote `d844549` was combined with the uncommitted cloud-entry correction. Its lawn hook
must bind the same live atmosphere objects as other surfaces, including `cloudLayer` and
`cloudEye`. The strengthened compiled-material check passes for 192 high / 173 low
materials, with no missing or copied uniform objects. Both tiers retain clear outside
rays, short cloud exits, obscured deep-cloud lamps and visible nearby foreground. Cloud
resize/quality-reduction budgets, target reuse and renderer-state restoration pass.

The high grass pool remains bounded at 32,400 instances and two tile uploads per update.
The incoming high-to-low reduction releases its mesh and uploaded atlas. A reduction during
loading builds no grass; initially low requests no atlas. Missing assets retain the terrain.
The removed low atlas and resized gravel maps save 210,986 image bytes; high imagery is
unchanged. The merged build's delivered resources on localhost are:

| Tier | Menu resource bodies | Fully prepared resource bodies |
| --- | ---: | ---: |
| High | 14,027,090 bytes | 62,859,430 bytes |
| Low | 8,620,694 bytes | 17,507,354 bytes |

Scenery preparation completes and the delivery test's three-second flight requests no
further resources. Automatic quality selection still waits for a foreground tab and chooses
low at the simulated slow cadence, while retaining the 1.5× resolution ceiling.

All 16 Node suites and 23 graphics checks pass on Chromium 141 / ANGLE Metal / Apple M2 Pro.
The cloud motion test's new `RECORD_VIDEO=0` path also passes for exterior/captain and both
tiers: 570 fixed updates through both boundaries, five rendered positions, no asset errors.
It reports no FPS because fixed updates are not a hardware timing measurement. Its default
now matches the incoming tests: SwiftShader, with optional `VISUAL_GPU=metal` and video
recording on a GPU. This Mac still cannot initialize SwiftShader WebGL2, so this integration
has not locally verified that renderer, physical phones or other GPUs. The complete
functional browser suite and new hardware FPS benchmarks were not rerun; earlier FPS
reports above retain their original pre-integration scope.

Raw integration results: `benchmarks/2026-10-10-cloud-scenery-integration.json`.


## Cloud colour by side, and software-rendering screenshots — 2026-10-10

Baseline: `e962658`. Its grazing-ray blend, the sky and every fogged material gave all cloud
the overcast base's grey, including the sunlit deck seen from above. From 200 m above the top,
looking at the horizon, the brightness stepped **38.3** levels between adjacent rows (published
`d844549`: 1.5) and the band below it fell from 214 to 176. The full-approach start is above
the crosswind deck, so this showed from the first frame.

One shared `cloudColor(dir)` now gives the side being seen: the sunlit tops' colour (0.8 of
the deck-top surface colour, the deck pass's own unresolved interior) from above, the overcast
grey from below, a blend by depth inside, each through the scenario haze of the clear air in
front of the layer. The sky, fog, cumulus and deck pass all use it, so their boundaries stay
seamless. Two uniforms are added; no texture, pass or draw call, and the colour is only worked
out where a ray meets cloud, so clear weather and rays away from the layer cost nothing more.
Median SwiftShader frame times (GPU work included) of the captain view in clear air, below and
above the crosswind deck stay within run-to-run noise of `e962658` on both tiers (low 6.7–7.4
s, high 14.1–15.5 s per frame for every build); no GPU was measured. At the view above:
horizon step **1.1** levels, band brightness 217. The 24 m entry seam falls from 3.6 to 0.8
levels; the mid-deck whiteout is lighter (204 against 175), between the sunlit top and grey
base. Below the deck the base colour is unchanged.

`test/cloud-boundary.mjs` now also limits that above-deck horizon step (2.1 measured on both
tiers; the unfixed build measures 38). The cloud motion test and `test/visual-review.mjs`
read one pixel before each screenshot: WebGL calls return before the GPU draws them, and
SwiftShader was still drawing the motion test's sampled frames 36 s later, beyond the
screenshot's 30 s. With that, both pass in software rendering; visual-review had failed the
same way on `d844549`. No GPU frame rates were measured.

## Upper opposite approach coverage — 2026-10-11

Baseline: published `4433b0b`. The working pass extends mapped ground and planting on the
opposite side by 2 km, and retains more surveyed variation in open-field albedo. It reuses
all imagery/material/model assets and the existing mask dimensions. The added PNG/JSON
resource bodies total **93,998 bytes** (322,507 bytes combined). GPU texture and CPU sampling
storage each stay approximately 8.12 MB. Total planting remains 52,000 high / 14,000 low.

Measured sequentially on Apple M2 Pro, Chromium 141.0.7390.37 / ANGLE Metal. Viewport is
1440 × 900; high is fixed at 1.5×, low at 1×. Each scene warms for 4 seconds and samples for
12 seconds, with physics paused and normal scenery/render updates. `captain-upper` is the
normal captain camera 4 km before threshold; `captain` is the existing 1.8 km sample.
`upper-opposite` matches the new overview capture. No other graphics tests ran concurrently.

| Quality / scene | Before FPS | After FPS | After frame ms p50 / p95 | Draw calls before → after |
| --- | ---: | ---: | ---: | ---: |
| High / captain-upper | 36.15 | 37.45 | 33.3 / 33.4 | 1076 → 1076 |
| High / captain | 37.81 | 39.14 | 33.3 / 33.4 | 931 → 931 |
| High / upper-opposite | 50.93 | 52.51 | 16.7 / 33.4 | 788 → 788 |
| Low / captain-upper | 60.00 | 60.00 | 16.7 / 16.7 | 597 → 597 |
| Low / captain | 59.17 | 60.00 | 16.7 / 16.7 | 542 → 542 |
| Low / upper-opposite | 60.00 | 60.00 | 16.7 / 16.7 | 486 → 486 |

There is no measured frame-rate regression in this pair. The small increases are within
short-run scheduling variability and do **not** demonstrate a speedup. High 1.5× still
misses 60 FPS in these views; the normal automatic resolution/quality policy remains.
Low results are display capped. This does not benchmark a complete flight, startup over
the Internet, mobile hardware, another graphics driver or uncapped GPU throughput.

The first baseline overlapped part of the CPU asset bake and was discarded for comparison.
It is retained as `benchmarks/2026-10-11-upper-corridor-before.json`. The uncontended baseline
and completed build are `benchmarks/2026-10-11-upper-corridor-before-clean.json` and
`benchmarks/2026-10-11-upper-corridor-final.json`. The review page uses the uncontended pair.
Reproduce with `BENCHMARK_SCENES=captain-upper,captain,upper-opposite` and
`BENCHMARK_ROOT` pointing to an archived `4433b0b` for the baseline.

Both-tier scenery checks retain clear mapped fields, road/building exclusions, total tree
budgets and the missing-mask fallback. The asset check verifies contour strips across the
internal allocation boundary, registration, protected airport clearance and the 340 KB
combined data budget. The wider views and unchanged captain views are available in
[the local comparison](output/upper-approach-review.html). The effect is substantially
clearer in the wider views than straight ahead from the cockpit; this is additional
coverage, not a complete scenery replacement.

Final validation: all 16 Node suites, 23 day/night/weather graphics checks and the both-tier
corridor/material/fallback checks pass on Chromium Metal. Review-page image selections,
labels, zoom/layout controls and six benchmark rows were checked. The full functional
browser suite, a fresh full-flight benchmark and another GPU were not run for this pass.


## Upper-valley dairy and silos — 2026-10-13

Baseline: published `ae16093`. Six placements become a complete dairy/silo site beside the
contour fields. The existing GLBs grow by 169,360 bytes high / 169,340 bytes low; extension
site data grows by 9,508 bytes and the shared manifest by 5,909 bytes. The net resource-body
increase is **184,777 bytes high / 184,757 bytes low**. No new images are introduced and
existing gravel maps are unchanged. All four farm/site packages total 2,485,007 bytes high /
1,533,409 low, excluding the source manifest. Scenery still prepares behind the menu.

The complete-building pool grows from 58,855 to 71,077 triangles; site grounds/fences from
81,218 to 119,900 (plus the unchanged original 2,924-triangle yard). Material/site batches
increase from 38 to 52, with per-site culling retained. Three eligible boundary trees replace
random planting inside the site, keeping total woodland budgets unchanged. Two rounded
silhouette records replace the old rectangular silo shadow plans; no new shadow pass is added.

Measured sequentially, with no other browser test or asset bake running: Apple M2 Pro,
Chromium 141.0.7390.37 / ANGLE Metal, 1440 × 900, fixed 1.5× high / 1× low. Each scene warms
for four seconds and samples twelve seconds. Physics is paused; normal scenery/render
updates continue. `captain-upper` is 4 km before threshold, `captain` is 1.8 km, and
`contour-farm` is the close exterior review camera.

| Quality / scene | Before FPS | After FPS | After frame ms p50 / p95 | Draw calls before → after |
| --- | ---: | ---: | ---: | ---: |
| high / captain-upper | 37.90 | 36.27 | 33.3 / 33.4 | 1076 → 1090 |
| high / captain | 38.81 | 38.56 | 33.3 / 33.4 | 931 → 931 |
| high / contour-farm | 49.68 | 50.10 | 16.7 / 33.4 | 317 → 333 |
| low / captain-upper | 60.00 | 60.00 | 16.7 / 16.8 | 597 → 611 |
| low / captain | 60.00 | 60.00 | 16.7 / 16.7 | 542 → 542 |
| low / contour-farm | 60.00 | 59.92 | 16.7 / 16.8 | 167 → 181 |

The upper-captain view is **4.3% slower** in this pair and submits 47,242 more triangles on
high. The other high views are close to baseline; their small differences do not prove a
speedup or zero cost. Low results are display capped near 60 FPS. The normal automatic
resolution/quality policy remains; these fixed-high views still miss 60 FPS. This pass was
not benchmarked over a complete flight, on mobile hardware, another GPU or a remote network.

Raw reports: `benchmarks/2026-10-13-contour-farm-render-{before,final}.json`. Reproduce with
`BENCHMARK_SCENES=captain-upper,captain,contour-farm node test/render-benchmark.mjs LABEL`,
using `BENCHMARK_ROOT` pointed at an archived `ae16093` for the baseline.

Validation: all 16 Node suites pass. Both-tier site checks verify 22 registered models,
24 roof samples, six extension-road connections and ground errors below 0.00002 m, with no
unplanned or intrusive site planting. Missing/invalid extension data retains the nine-model
original valley site; missing main model/material/site data retains all procedural buildings.
The authored-scenery check confirms shared atmospheric uniforms on every compiled fogged
material. Rounded shadows pass a geometry regression and a rendered on/off visibility check.
Records: `benchmarks/2026-10-13-contour-farm-{sites,authored}.json`. The full functional browser
suite and unrelated graphics scenarios were not rerun for this localized asset pass.

[The local review](output/contour-farm-review.html) includes both quality tiers, matched
close/wide/weather/night views and unchanged forward captain cameras. The visual gain is
localized; the normal forward seat shows much less than the exterior detail view.


## Woodland crown coverage and upper stand density — 2026-10-14

Baseline: published `3089610`. The woodland pass retains more fine foliage on small crowns
and allocates more of the existing trees to upper mapped stands. The alpha cutoff uses UV
derivatives to blend from 0.15 at 64 rendered pixels to the original 0.28 at 128 pixels.
It adds shader arithmetic and a varying, but no texture fetch, draw pass, geometry asset,
image or GPU texture. The map/manifest pair remains 322,507 bytes; the numeric allocation
edits do not change its byte size. This is **zero additional asset transfer**, not zero
additional rendering work: fuller leaves and denser visible stands can increase overdraw.

Total woodland instances remain 52,000 high / 14,000 low. Actual mapped instances grow
17,081 → 21,497 high and 8,129 → 9,750 low; wider photo-selected planting decreases to
compensate. Close mapped stands keep their spacing and take priority within their allocation.
No new material or render pass is added. Different background positions/tints can change
which nearby trees enter the existing bounded geometry pool, so rendered triangle counts
can move even with unchanged model and total instance budgets.

Measured sequentially on Apple M2 Pro, Chromium 141.0.7390.37 / ANGLE Metal, 1440 × 900,
fixed high 1.5× / low 1×. Each scene warms for four seconds and samples twelve seconds with
physics paused. Normal scenery and rendering updates run. No other graphics test or asset
bake ran concurrently. The nearby camera also moves through 30 m during sampling.

| Quality / scene | Before FPS | After FPS | After frame ms p50 / p95 | Draw calls before → after |
| --- | ---: | ---: | ---: | ---: |
| high / captain-upper | 37.28 | 36.73 | 33.3 / 33.4 | 1090 → 1090 |
| high / captain | 39.11 | 39.03 | 33.3 / 33.4 | 931 → 931 |
| high / upper-opposite | 51.61 | 50.93 | 16.7 / 33.4 | 802 → 802 |
| high / nearby | 50.60 | 50.86 | 16.7 / 33.4 | 430 → 430 |
| low / captain-upper | 60.00 | 60.00 | 16.7 / 16.8 | 611 → 611 |
| low / captain | 59.75 | 60.00 | 16.7 / 16.7 | 542 → 542 |
| low / upper-opposite | 60.00 | 60.00 | 16.7 / 16.7 | 500 → 500 |
| low / nearby | 60.00 | 60.00 | 16.7 / 16.7 | 288 → 288 |

High upper-captain and upper-woodland views are about **1.5% / 1.3% slower** in this pair;
the closer captain is about 0.2% slower and nearby about 0.5% faster. These short differences
include scheduling variation and establish neither a speedup nor zero cost. Draw calls
stay unchanged in all four views; the largest sampled triangle increase is 30,721 in the
nearby high view, with different nearby selections. Low is display capped near 60 FPS.
High fixed 1.5× still misses 60 FPS; automatic resolution/quality behavior is unchanged.
This does not measure a full live flight, mobile hardware, another driver or Internet loading.

Raw reports: `benchmarks/2026-10-14-woodland-render-{before,final}.json`. Reproduce with
`BENCHMARK_SCENES=captain-upper,captain,upper-opposite,nearby node test/render-benchmark.mjs LABEL`,
using `BENCHMARK_ROOT` pointed at an archived `3089610` for the baseline.

Validation uses the actual material/atlas on both tiers: 54 size/view cases each show
46.1% / 45.4% more summed leaf alpha at 24 and 64 pixels, transparent empty borders and
unchanged large-crown coverage within 1%. Sixteen close card/geometry silhouette cases
match the baseline exactly (mean overlap 0.397); this preserves, rather than resolves,
the existing imperfect match. The matched 420 m moving check retains the 0.35-second fade,
peaks at 33 nearby trees / 2,391,378 triangles, and stays within the original 48-tree /
2.4-million-triangle limits. The recordings are motion evidence, not FPS benchmarks.
Both-tier scenery checks retain clear fields, protected airport/road/building/site areas,
fixed total budgets, shared ground registration and the missing-mask fallback.
Reports: `benchmarks/2026-10-14-woodland-{coverage,motion-before,motion-final,scenery}.json`.

[The local review](output/woodland-coverage-review.html) includes matched both-tier canopy,
upper woodland, contour-field, storm/night and captain views, plus both motion clips.
The normal forward cockpit benefit is subtle; wider mapped woodland shows the difference
more clearly. Distant/low trees remain image planes and unmapped hills remain sparse.

Final validation: all 16 Node suites and the vegetation/weather browser suite pass on
Chromium Metal, including decompressor fallbacks and the new both-tier coverage check.
The review page passes all 20 view/quality/captain combinations, image dimensions and
before/after paths, eight benchmark rows, zoom/layout, both motion clips and narrow layout.
The full functional browser suite, a full-flight benchmark and another GPU were not run.


## Fitted glazing, water and wipers — 2026-10-14

Baseline: published `e9b194f`. Six patches follow the source window frame. They share
1,152 pane triangles between a faint reflection pass and a wet-only water pass. Two fitted
wipers add 48 triangles and replace the fallback blades. No GLB or image is added or changed;
the measured startup transfer grows by **9,744 bytes** on both tiers, from JavaScript changes.
This is an effect/geometry addition, not zero rendering cost.

High quality copies the already tone-mapped exterior once per wet cockpit frame and samples
it for droplet refraction. At fixed high 1.5× here, the 2160 × 1350 RGBA8 texture consumes
**11,664,000 bytes**, excluding driver overhead. Low has no copy or extra framebuffer texture
and draws shaded water instead. Dry, HUD and settled ND views skip copying; resizing replaces
and disposes the old texture, and scenario reset/adaptive downgrade release it. The glazing
is excluded from both cabin PMREM capture and baked diffuse light.

Measured sequentially on Apple M2 Pro / Chromium 141.0.7390.37 / ANGLE Metal, 1440 × 900 CSS
pixels, fixed high 1.5× / low 1×. Each scene warms for four seconds and samples twelve seconds
with physics paused; scenery, windshield animation and rendering update during sampling.
No other graphics test or asset bake ran concurrently. The repeat reverses run order
(candidate then baseline), because CPU/frame timings varied in the first pair.

| Quality / scene | First before → after FPS | Repeat before → after FPS | After p95 ms first / repeat | Draw calls before → after |
| --- | ---: | ---: | ---: | ---: |
| high / captain | 39.81 → 37.31 | 38.56 → 38.06 | 33.4 / 33.4 | 931 → 939 |
| high / storm | 42.38 → 38.20 | 40.00 → 38.56 | 33.4 / 33.4 | 928 → 939 |
| low / captain | 60.00 → 59.92 | 59.67 → 60.00 | 16.8 / 16.8 | 542 → 548 |
| low / storm | 60.00 → 59.92 | 59.84 → 59.92 | 16.8 / 16.7 | 523 → 532 |

High captain is **1.3–6.3% slower** and high storm **3.6–9.9% slower** across these pairs.
The ranges include scheduling variation, not just the effect's cost. Low remains display
capped near 60 FPS; that does not establish spare GPU capacity. High fixed 1.5× still misses
60 FPS. The existing automatic resolution/quality policy remains, and its downgrade also
disables refraction. Full-flight performance, other GPUs and real mobile hardware were not
benchmarked. This pass does not claim a performance improvement.

Raw reports: `benchmarks/2026-10-14-windshield-render-{before,final,before-repeat,final-repeat}.json`.
Reproduce with `BENCHMARK_SCENES=captain,storm node test/render-benchmark.mjs LABEL`, using
`BENCHMARK_ROOT` pointed at an archived `e9b194f` for baseline. An earlier candidate without
logarithmic depth support was discarded; these retained final measurements use the corrected
shader and its derivative handling.

Validation: all 16 Node suites, the existing visual/cabin-lighting browser checks and the new
both-tier windshield checks pass on Metal. Visible pane water leaves the PFD/ND pixels unchanged;
the isolated shader checks droplet movement, bounded clearing and dry reset. HUD/ND skip copies,
resizing disposes the old texture, and quality downgrade retains water without refraction.
Retained report: `benchmarks/2026-10-14-windshield-validation.json`. The lighting test's stale
cloud-crossing probe was corrected to change camera height; its original assertion also failed
on published main. Cloud runtime code was not changed. The full functional suite was not rerun.

[The local review](output/windshield-review.html) includes matched high/low weather, side and
night images, wiper recordings, and landscape touch captures. Water flow and blade contact
remain approximations. There is no icing, condensation or physically complete transmission.


## Rain repetition and continuous motion — 2026-10-15

Baseline: published `c8869d5`. A CPU-integrated pool replaces the fixed, wrapping GPU line
field. The original positions repeated exactly every ten seconds at 70 m/s ground speed;
velocity changes could reposition the field because the shader multiplied current speed by
total elapsed time. New drops respawn upstream with fresh positions and sizes, fade at pool
edges and follow world-space wind minus aircraft velocity. Looking around does not rotate
their motion. One instanced soft-streak pass replaces one line pass: **5,200 triangles high /
1,800 low**, with no extra draw call. Low now enforces 900 drops even on desktop and after
adaptive downgrade; high retains 2,600. The old desktop low path kept 2,600 line segments.

The two dynamic instance attributes upload at most **72,800 bytes per wet frame** on a pool
allocated for high, or **25,200 bytes** for a pool created low. No rain texture, render target
or model is added. Startup transfer grows **3,634 bytes** on both tiers from code changes.
Existing windshield refraction memory/copies are unchanged. Pane droplet hashes now include
their arrival index, removing the same-location 4–8 second cycle without another texture
fetch or pass. The change adds particle updates and shader arithmetic; it is not zero cost.

Measured sequentially on Apple M2 Pro / Chromium 141.0.7390.37 / ANGLE Metal, 1440 × 900 CSS
pixels, fixed high 1.5× / low 1×. Four-second warm-up, twelve-second sample, paused physics
with scenery, rain and windshield updates. No concurrent graphics test or asset bake.

| Quality / scene | Before → after FPS | After frame ms p50 / p95 | CPU p50 ms before → after | Draw calls before → after |
| --- | ---: | ---: | ---: | ---: |
| high / captain | 39.61 → 39.56 | 33.2 / 33.4 | 4.6 → 4.4 | 939 → 939 |
| high / storm | 40.97 → 41.64 | 16.7 / 33.4 | 4.8 → 3.8 | 939 → 939 |
| low / captain | 60.00 → 60.00 | 16.7 / 16.7 | 2.9 → 2.9 | 548 → 548 |
| low / storm | 60.00 → 59.92 | 16.7 / 16.7 | 2.9 → 2.8 | 532 → 532 |

No slowdown beyond short-run variation is apparent in this pair; the 1.6% higher storm FPS
does not establish a speedup. Low is display capped and high at fixed 1.5× still misses 60 FPS.
Full-flight, mobile hardware and other GPUs were not benchmarked. The existing automatic
resolution/quality policy remains. Raw reports: `benchmarks/2026-10-15-rain-render-{before,final}.json`.
Reproduce with `BENCHMARK_SCENES=captain,storm node test/render-benchmark.mjs LABEL`, using
`BENCHMARK_ROOT` pointed at an archived `c8869d5` for baseline.

All 17 Node suites pass. Both-tier rendered rain checks use the actual shaders: ten-second
outside-frame overlap falls from 99.89% to 0.33% high / 0.17% low; consecutive normalized pane
arrival overlap falls from 100% to 8.02%. These are pattern tests, not a physical accuracy
measure. Rain remains visible, side views retain world orientation, clear weather hides it
and adaptive low limits the pool. Both-tier windshield checks retain clearing, instrument
occlusion, buffer disposal and low fallback. The night assertion allows fewer bright pixels
from the softer rain but still checks visible distortion and unchanged instruments.
Reports: `benchmarks/2026-10-15-rain-{before,final,glass-final}.json`.

[The local review](output/rain-motion-review.html) includes matched storm/side/night/stopped
captures, twenty-second videos and isolated loop frames. The full functional browser suite
was not rerun for this effect-only correction. Rain shafts, spray, splashes and full water
films remain unimplemented; lightning timing and flight physics are unchanged.


## Upper-valley coverage — 2026-10-15

Baseline: published `d9a30ef`. The ground-cover map extends another 2.9 km and the
existing tree pool is redistributed into the upper valley's woods. Both tiers retain
52,000 / 14,000 total trees; mapped allocations now account for 39,848 / 12,430 including
30 existing site trees. Denser foreground coverage can increase fragment work even when
the instance and draw-call totals do not grow. The existing near-tree triangle/count
limits, renderer quality policy and detail-tile streaming are unchanged.

The mask/manifest grows from 322,507 to **435,319 bytes (+112,812)**, loaded with optional
scenery. No new tree/model/photo download is added. The high GPU data mask and retained
CPU mask each grow from 8.12 to 14.007 MB. Low filters its GPU copy to 2048 × 603,
**4.940 MB**, retaining full CPU precision for placement. Ground shading adds a few
arithmetic operations to retain photographic variation, with no extra texture lookup
or ground pass. The offline bake's spatial index reproduces the prior full-search
coverage while avoiding testing every road/building for every pixel.

The same Apple M2 Pro / Chromium 141 / ANGLE Metal setup uses 1440 × 900 CSS pixels,
fixed high 1.5× and low 1×, four seconds of warm-up and twelve seconds per position,
paused physics but active scenery updates. The first two positions are at 7.5 and 6 km
before threshold, where the extension is visible; the other two are at 4 and 1.8 km.

| Tier / scene | FPS before → after | After p95 | Draw calls before → after | Triangles before → after |
| --- | --- | --- | --- | --- |
| high / captain-entry | 37.45 → 35.12 | 33.4 ms | 1302 → 1300 | 2,543,215 → 2,551,187 |
| high / captain-valley | 36.85 → 35.74 | 33.4 ms | 1233 → 1233 | 2,442,318 → 2,441,966 |
| high / captain-upper | 37.03 → 37.45 | 33.4 ms | 1098 → 1094 | 2,321,149 → 2,294,329 |
| high / captain | 38.11 → 37.37 | 33.4 ms | 939 → 936 | 2,115,830 → 2,106,078 |
| low / captain-entry | 60.00 → 60.00 | 16.8 ms | 707 → 703 | 993,831 → 993,811 |
| low / captain-valley | 60.00 → 59.84 | 16.7 ms | 673 → 673 | 968,424 → 968,060 |
| low / captain-upper | 60.00 → 60.00 | 16.7 ms | 617 → 617 | 926,767 → 921,619 |
| low / captain | 57.09 → 60.00 | 16.7 ms | 548 → 548 | 802,592 → 800,252 |

High FPS falls **6.2% at entry and 3.0% over the upper valley** in this pair. The closer
samples vary from +1.1% to −2.0%; low is display-capped near 60 FPS, except the original
closer sample at 57.09. These short samples include scheduling variation and do not
prove a speedup in the closer/low views. The roughly 35–37 FPS high result confirms
that forcing 1.5× remains expensive. Automatic resolution/quality remains available.

Raw reports: `benchmarks/2026-10-15-upper-valley-render-before.json` and
`benchmarks/2026-10-15-upper-valley-render-final.json`. Rendered land-cover checks are
retained in `benchmarks/2026-10-15-upper-valley-scenery.json`. All 17 Node suites and
both-tier clearances, field openness, GPU mask dimensions, close material visibility
and missing-mask fallback pass. The local `output/upper-valley-review.html` contains
matched normal-cockpit, wide, low/high and night captures.

A **complete real-time short-final autoland** through the UI Start handler also passes:
137.61 s, score 100, fixed high at **1×**, average **58.94 FPS**, p95 **16.8 ms**, p99
**33.3 ms**. It records three intervals over 50 ms: a 199.9 ms spike at flight start,
66.7 ms around x=5649 and 50.1 ms around x=8536. Menu preparation takes 6.67 s; no resource
requests start during flight. Quality remains high/1× throughout. This is a cold local
browser run on the same M2 Pro, not an Internet download test or paired proof of a
performance improvement. Report: `benchmarks/2026-10-15-upper-valley-flight.json`.
Other GPUs, real phone hardware and the complete functional browser suite were not run
for this scenery pass.

All 23 browser graphics regression checks pass. Review-page validation confirms 16
matched view/quality selections, eight benchmark rows, full-width comparison, zoom
and narrow-screen layout without page or resource errors.


## Fair-weather cloud forms and shading — 2026-10-16

Baseline: published `0b3c2c5`. Six distinct 80³ cloud fields replace four 64³ fields.
The 160×80×240 packed texture occupies **3,072,000 bytes**, up **2,023,424 bytes** on
both the GPU and in retained CPU density data. Compressed startup transfer rises from
**79,064 to 208,555 bytes (+129,491)**. Low does not request the density asset. There
are still 26 cloud volumes, 36 view steps and three shadow lookups at occupied steps.
The renderer uses fixed midpoints rather than per-pixel random ray starts. New cloud
shapes, opacity and shadowing can change occupied samples even with the same step cap.

A 48-step candidate was rejected after measuring extra cost without a sufficient visual
benefit. The final 36-step version keeps the richer silhouettes and removes the random
sampling grain. Fine structure is still soft close up; fixed-step integration can reveal
faint bands in very large views. There is no temporal accumulation or simulated weather
formation. Overcast, low-tier sprites, rain and flight physics are unchanged.

The final paired runs use Apple M2 Pro / Chromium 141 / ANGLE Metal, 1440×900 CSS pixels,
fixed high 1.5× / low 1×, four seconds warm-up and twelve seconds per view, with physics
paused and scenery active. Baseline and final were measured back-to-back on October 16
after the interrupted development session. The numbers measure display-paced frame
intervals, not uncapped GPU throughput; small differences include scheduling variation.

| Tier / scene | FPS before → after | After p95 | Draw calls before → after |
| --- | --- | --- | --- |
| high / captain-entry | 34.70 → 34.57 | 33.4 ms | 1300 → 1300 |
| high / captain | 38.61 → 38.64 | 33.4 ms | 936 → 936 |
| high / cloud-sky | 56.01 → 56.43 | 33.3 ms | 402 → 402 |
| high / cloud-close | 47.29 → 48.19 | 33.4 ms | 52 → 52 |
| low / captain-entry | 60.00 → 60.00 | 16.7 ms | 703 → 703 |
| low / captain | 59.92 → 60.00 | 16.7 ms | 548 → 548 |
| low / cloud-sky | 60.00 → 60.00 | 16.8 ms | 269 → 269 |
| low / cloud-close | 60.00 → 60.00 | 16.7 ms | 49 → 49 |

High differs by −0.4% to +1.9% in this pair; low remains near 60 FPS. This is broadly
unchanged measured pacing, not evidence of a speedup. Draw calls and triangle totals are
unchanged. Forced high 1.5× still does not sustain 60 FPS in the cockpit. Other hardware
and real phones have not been benchmarked.

Raw reports: `benchmarks/2026-10-16-cumulus-render-before.json` and
`benchmarks/2026-10-16-cumulus-render-final.json`. The matched local review is
`output/cumulus-review.html`. All eight low captures and the high overcast capture are
byte-identical to the baseline; only high fair-weather rendering changes.

Validation includes all 17 Node suites and the actual production cloud/atmosphere shaders
on Metal: six distinct silhouettes, response to a changed sun direction, darker moonlit
clouds and nonblack interiors. Raw isolated-shader results are in
`benchmarks/2026-10-16-cumulus-lighting.json`; full-game captures use the actual game scene.
A SwiftShader attempt first timed out during game startup. A minimal renderer-only harness
then failed at WebGL context creation, before loading the cloud, so software-renderer
compatibility remains **unverified on this host**, not a passed check. The full functional
browser suite and full-flight performance were not rerun for this weather-only pass.

All 23 graphics regression checks pass on Metal. Corrupt-volume, missing-decompressor,
host-decoded gzip and automatic-quality disposal checks also pass. The review page passes
all 16 matched image selections, eight benchmark rows, full-width comparison, zoom and
narrow-screen layout without page or resource errors.

## Airport architecture and night glazing — 2026-10-16

Baseline: `0a59a48`. Terminal halls now have stepped roof heights, connected galleries,
service cores, mezzanine bands, braced supports and opaque painted glazing. The tower
has a supported sloped cab and balcony, and the hangars have pitched roofs and framed
doors. Both tiers use the same architecture; initial low quality reduces fine seams,
side ribs and canvas dimensions. Geometry is grouped by building section and material.

The airport module contains **13,672 triangles high / 8,980 low**, in 33 spatial/material
batches including the sign. This replaces the previous halls, tower, hangar bodies and
fittings; these are module totals, not additional triangles. Draw counts and visible
triangles for the actual views are recorded below. Merged geometry has about **1.80 MB
high / 1.19 MB low** of attribute/index storage, retained on the CPU and uploaded to the
GPU. This trades some instancing efficiency for fewer material submissions and useful
spatial culling.

Two generated facade canvases and a sign use approximately **2 MiB high / 0.5 MiB low**
of RGBA GPU storage including mipmaps, replacing the former **0.67 MiB** window map.
Their retained base canvas images are **1.5 MiB / 0.375 MiB**. Automatic downgrade keeps
these small static meshes and maps. Day/night changes reuse them rather than generating
new window textures. There are no additional image/model requests; the runtime JS size
change is recorded with the final comparison below. No new render target, shader pass,
light or frame-loop update is added.

Measurements use Chromium 141 / ANGLE Metal on Apple M2 Pro, 1440×900 CSS pixels, fixed
high 1.5× and low 1×, four seconds of warm-up and twelve seconds of RAF samples per
position. Physics is paused and normal scenery updates continue. The paired runs are
short display-capped samples, not a full-flight or cross-device performance claim.

| Tier / view | Before FPS | After FPS | After p95 frame | Draw calls |
| --- | ---: | ---: | ---: | ---: |
| high / captain | 38.78 | 39.03 | 33.4 ms | 936 → 917 |
| high / rollout | 41.05 | 41.11 | 33.4 ms | 707 → 700 |
| high / airport | 56.76 | 57.26 | 16.8 ms | 328 → 328 |
| high / terminal | 53.43 | 53.69 | 33.3 ms | 263 → 263 |
| low / captain | 60.00 | 60.00 | 16.7 ms | 548 → 529 |
| low / rollout | 60.00 | 60.00 | 16.7 ms | 404 → 397 |
| low / airport | 60.00 | 60.00 | 16.7 ms | 236 → 236 |
| low / terminal | 60.00 | 60.00 | 16.7 ms | 173 → 173 |

Runtime source grows by **9,132 bytes** across the three changed modules
(approximately 3,807 additional bytes if each is gzip-served). Local test hosting serves
uncompressed JS. High FPS differs by **+0.1% to +0.9%**, small scheduling variation rather
than evidence of a speedup. Low remains display-capped at about **60 FPS**. Fixed high
1.5× still does not hold 60 FPS in the cockpit; the existing adaptive quality policy
remains necessary. No new asset/resource errors were recorded.

All 17 Node suites and the 23-check graphics browser group pass. The airport browser
check validates finite/non-degenerate geometry, front-face orientation, airport
clearance, lighting state and geometry/texture budgets, with ten matched views per
tier. Images include the forward cockpit, rollout side look, terminal, tower, hangars,
landside, night and storm. Close roof inspection corrected reversed surface normals
and removed tiny hangar roof ribs that aliased at shallow angles; small eave shadows
still reveal the coarse airport-wide shadow map. Other GPUs, software rendering,
physical phones and the full functional flight suite were not tested for this pass.

Reproduce (set `PLAYWRIGHT_BROWSERS_PATH` to the installed browser cache if needed):

```sh
VISUAL_GPU=metal npm run test:airport
VISUAL_GPU=metal REVIEW_ROOT=/path/to/0a59a48 node test/airport-architecture.mjs airport-before
BENCHMARK_ROOT=/path/to/0a59a48 BENCHMARK_SCENES=captain,rollout,airport,terminal node test/render-benchmark.mjs airport-before
BENCHMARK_SCENES=captain,rollout,airport,terminal node test/render-benchmark.mjs airport-final
```

Raw records: `benchmarks/2026-10-16-airport-captures.json`,
`benchmarks/2026-10-16-airport-render-before.json` and
`benchmarks/2026-10-16-airport-render-final.json`. The ignored local
`output/airport-architecture-review.html` presents matched views and these timings.
The architecture remains simplified; transparent interiors, unique wear, richer ramp
and landside furnishings, and finer local shadows remain future work.

## Phone cockpit framing — 2026-10-17

Baseline `758d903`, Apple M2 Pro / Chromium ANGLE Metal. Paired samples use a
852×393 touch viewport, low quality, fixed 1× rendering, four seconds warm-up and
twelve seconds sampling. Physics is paused; scenery and windshield updates run.
This measures the desktop GPU at phone resolution, not a physical phone.

| Scene | Before FPS | After FPS | After p95 frame | Draw calls before → after | Triangles before → after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Captain, clear | 60.00 | 60.00 | 16.8 ms | 575 → 540 | 803,616 → 793,834 |
| Captain, storm | 60.00 | 60.00 | 16.8 ms | 555 → 521 | 818,061 → 807,971 |

The narrower lens excludes some scene geometry. Both runs reach the display cap,
so they establish no measured frame-rate improvement. No GPU resources, asset
requests or render passes were added. The changes are camera parameters and CSS,
plus one cached body-class update when entering/leaving the panel look.

Reproduce with the installed Playwright browser cache configured:

```sh
VISUAL_GPU=metal npm run test:phone-cockpit
BENCHMARK_TOUCH=1 BENCHMARK_WIDTH=852 BENCHMARK_HEIGHT=393 BENCHMARK_TIERS=low BENCHMARK_SCENES=captain,storm node test/render-benchmark.mjs phone-cockpit-final
# For a baseline, add BENCHMARK_ROOT=/path/to/758d903 and use label phone-cockpit-before.
```

Raw records: `benchmarks/2026-10-17-phone-cockpit-captures.json`,
`benchmarks/2026-10-17-phone-cockpit-render-before.json` and
`benchmarks/2026-10-17-phone-cockpit-render-final.json`. The visual audit records
geometry, layout and browser coverage. Physical phones, other GPUs and the full
flight suite were not benchmarked or rerun for this view/layout change.


## Packed land-cover placement copy — 2026-10-17

Baseline: `5c6099a`. The CPU copy of the land-cover mask that tree and grass placement sample
kept the decoded RGBA pixels: **14.007 MB** on every tier, phones included, although alpha is
unused. Each pixel now holds one class and its weight in two bytes; the 6,116 pixels (0.17%)
where classes blend keep all three weights in a side table. Measured in Node, the copy takes
**7.00 MB plus 0.66 MB**, 45% less, and returns exactly the old values: `test/corridor-assets.test.mjs`
compares every one of the 3,501,750 pixels. Placement is therefore unchanged on both tiers, and
two million samples take 75 ms. The full-size canvas used to decode the mask is released as soon
as it has been read, rather than at garbage collection. The GPU texture is unchanged (14.007 MB
high, 4.940 MB low). Physical phones were not measured.

## Cockpit surface finishes — 2026-10-18

Baseline `0b14a19`, Apple M2 Pro / Chromium ANGLE Metal. Matched 1440×900 views use
fixed 1.5× high / 1× low, four seconds warm-up and twelve seconds sampling. Physics
is paused; scenery and windshield updates run. GPU tests were run sequentially.

| Tier / scene | Before FPS | After FPS | After p95 frame | Draw calls, unchanged | Triangles, unchanged |
| --- | ---: | ---: | ---: | ---: | ---: |
| High / captain | 36.95 | 37.56 | 33.4 ms | 917 | 2,105,296 |
| High / storm | 38.23 | 39.31 | 33.4 ms | 917 | 2,121,599 |
| Low / captain | 60.00 | 60.00 | 16.8 ms | 529 | 794,778 |
| Low / storm | 60.00 | 60.00 | 16.8 ms | 513 | 807,719 |

The small FPS differences do not establish a speedup. High at fixed 1.5× remains
below 60 FPS; automatic resolution/tier adaptation is unchanged. These are desktop
GPU measurements, not physical phone results.

The added lossless WebP atlas is **309,360 bytes high / 133,132 bytes low** (302 / 130 KiB).
Only the selected tier's file is requested. It costs approximately **5.33 / 1.33 MiB**
of GPU texture storage including mipmaps. High reuses the existing liner texture
for glareshield grain, so that does not add another scan download or texture allocation.
New UV/weight attributes total 323,172 / 229,596 bytes; high also adds 21,612 bytes of
metric grain coordinates for the shared glareshield mesh. No extra draw calls,
triangles or render passes are introduced. Selected materials take one additional
atlas sample; high incorporates the panel edge profile in the existing guarded bump
calculation. Low only varies colour and roughness.

Reproduce with the installed Playwright cache configured:

```sh
VISUAL_GPU=metal npm run test:cockpit-surfaces
VISUAL_GPU=metal npm run test:lighting
VISUAL_GPU=metal npm run test:phone-cockpit
BENCHMARK_ROOT=/path/to/0b14a19 BENCHMARK_SCENES=captain,storm node test/render-benchmark.mjs cockpit-surfaces-before
BENCHMARK_SCENES=captain,storm node test/render-benchmark.mjs cockpit-surfaces-final
```

Raw records: `benchmarks/2026-10-18-cockpit-surfaces-render-before.json`,
`benchmarks/2026-10-18-cockpit-surfaces-render-final.json`,
`benchmarks/2026-10-18-cockpit-surfaces-captures.json` and
`benchmarks/2026-10-18-cockpit-surfaces-phone.json`. The local ignored
`output/cockpit-surfaces-review.html` contains matched full-scene views.
The unit, lighting, graphics and phone framing checks pass on this Mac. Other GPU
drivers, physical phones and a complete aircraft-specific material set remain open.


## Residential approach frontage — 2026-10-19

Baseline `396c522`, Apple M2 Pro / Chromium ANGLE Metal. Matched 1440×900 views,
fixed 1.5× high / 1× low, four seconds warm-up and twelve seconds sampling.
Physics is paused; scenery and windshield updates run. GPU tests were sequential.

| Tier / scene | Before FPS | After FPS | After p95 frame | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain-upper | 35.11 | 36.65 | 33.4 ms | 1075 → 1088 | 2,293,547 → 2,367,669 |
| high / roadside-homes | 49.60 | 50.60 | 33.4 ms | 666 → 679 | 954,729 → 1,025,113 |
| high / storm | 37.65 | 40.11 | 33.4 ms | 917 → 917 | 2,121,599 → 2,119,833 |
| low / captain-upper | 60.00 | 60.00 | 16.7 ms | 598 → 611 | 916,145 → 982,126 |
| low / roadside-homes | 60.00 | 60.00 | 16.8 ms | 428 → 441 | 503,634 → 569,615 |
| low / storm | 60.00 | 60.00 | 16.7 ms | 513 → 513 | 807,719 → 796,964 |

This adds rendering work: the sampled upper captain view has 13 extra draw calls
and 74,122 extra submitted triangles on high (65,981 on low). The new site's source
geometry adds 21,298 building triangles and 55,966 grounds/fence triangles before
subtracting replaced procedural facades. Complete-building batches grow from 52
to 65 for all five sites, including their ground and boundary meshes. Existing
spatial culling remains. No extra render pass or per-frame site-generation work
is introduced.

The frame measurements do not establish a speedup or a consistent slowdown. An
intermediate run recorded 35.19 FPS in the high captain view and 48.37 FPS at the
frontage; the baseline and final results span roughly 35–37 and 48–51 FPS. High
at forced 1.5× is still well below 60 FPS. All sampled low scenes stayed display
capped at 60 FPS. Automatic quality adaptation is unchanged; this is desktop
Metal, not a physical-phone benchmark or evidence for other GPUs.

Model, site data and yard maps add **423,260 bytes high / 421,900 bytes low**
(413 / 412 KiB), excluding approximately 3 KiB of expanded source/placement JSON.
Their new totals are **2,908,267 / 1,955,309 bytes**. The original 256 px shingle
texture is embedded in the model and adds about 0.33 MiB of GPU texture storage
with mipmaps. Existing clapboard, timber and gravel textures are reused. The
larger model is prepared behind the menu using the existing pipeline; no new
in-flight asset request path is added. The total site/tree budgets stay bounded.

Reproduce with the installed Playwright cache configured:

```sh
npm test
VISUAL_GPU=metal node test/approach-sites.mjs roadside-homes-final
VISUAL_GPU=metal node test/authored-scenery.mjs roadside-homes-integration
VISUAL_GPU=metal node test/approach-scenery.mjs
BENCHMARK_ROOT=/path/to/396c522 BENCHMARK_SCENES=captain-upper,roadside-homes,storm node test/render-benchmark.mjs roadside-homes-before
BENCHMARK_SCENES=captain-upper,roadside-homes,storm node test/render-benchmark.mjs roadside-homes-final
```

Raw records: `benchmarks/2026-10-19-roadside-homes-render-before.json`,
`benchmarks/2026-10-19-roadside-homes-render-first.json`,
`benchmarks/2026-10-19-roadside-homes-render-final.json` and
`benchmarks/2026-10-19-roadside-homes-captures.json`. The ignored local
`output/roadside-homes-review.html` offers 32 matched images, including normal
captain views, storm and night. All images, comparison labels, zoom controls,
benchmark rows and the narrow-screen layout were checked. The full functional
flight suite was not rerun for this scenery-only pass.


## Directional woodland lighting — 2026-10-19

Baseline `2dbf3a7`, Apple M2 Pro / Chromium 141 ANGLE Metal. Matched 1440×900
views, fixed 1.5× high / 1× low, four seconds warm-up and twelve seconds sampling.
Physics is paused; scenery and windshield updates run. The selected paired GPU
runs were sequential, with no concurrent baking or rendering.

| Tier / scene | Before FPS | After FPS | After p95 frame | Draw calls, unchanged | Triangles, unchanged |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain-upper | 36.27 | 36.03 | 33.4 ms | 1,088 | 2,367,669 |
| high / roadside-homes | 50.18 | 50.18 | 33.4 ms | 679 | 1,025,113 |
| high / nearby | 51.03 | 51.11 | 33.4 ms | 396 | 2,429,019 |
| high / storm | 39.86 | 39.59 | 33.4 ms | 917 | 2,119,833 |
| low / captain-upper | 60.00 | 60.00 | 16.7 ms | 611 | 982,126 |
| low / roadside-homes | 60.00 | 60.00 | 16.8 ms | 441 | 569,615 |
| low / nearby | 60.00 | 60.00 | 16.7 ms | 260 | 308,710 |
| low / storm | 59.92 | 60.00 | 16.7 ms | 513 | 796,964 |

Final high measurements stay within 0.7% of the baseline; all low scenes remain
near the 60 FPS display limit. These samples do not establish a speedup or exclude
cost on other GPUs. Forced 1.5× high still runs at 36–51 FPS here. Automatic quality
adaptation is unchanged, and physical phones and software renderers were not measured.

The first version sampled four directional-response texels for every tree-card
fragment. It measured 34.87 / 47.02 / 50.76 / 38.20 FPS in these four high scenes,
and the low storm case fell to 48.02 FPS. The final shader samples only after
alpha and LOD-dither rejection, using explicit gradients calculated before discard
so mip selection stays defined. It also skips response reads when sunlight is
fully obscured or at night. The deck's residual 8% fill fades continuously to a
zero directional contribution. The initial regression and the optimized result
are both retained in the raw records.

Nine delivered CC0 forms are rebaked with diffuse sky illumination instead of a
fixed sun. A linear response atlas stores six opposing light measurements as three
signed differences, including source self-occlusion. This is first-order directional
response, not a normal map or complete dynamic self-shadowing. Its magnitude is
preserved during four-view blending, then rotated into the world and evaluated
against the sun. No geometry, tree placements, draw calls, render passes or runtime
shadow maps are added. Nearby model rendering and its budgets are unchanged.

Rebaked colour and added response images increase transfer by **607,980 bytes high /
199,768 bytes low** (594 / 195 KiB). The response file itself is 630,314 / 205,730 bytes;
colour files shrink slightly. Response textures add about **10.1 / 2.5 MiB** of GPU
storage including mipmaps. Only the selected tier is loaded, through existing
scenery preparation. A missing or incorrectly sized optional map retains the
diffuse-sky colour atlas. The extra sampler performs four reads per surviving
sunlit fragment and none in the fully diffuse lighting path.

Validation: all 17 Node suites; 24 real-material directional-lighting cases;
four missing/wrong-size response fallback cases; 108 leaf-coverage cases; and a
420 m moving tree pass. All 16 source/card silhouette measurements and moving
selection/fade records are identical to the main baseline. The 48-tree and
2.4-million-triangle limits remain satisfied. The comparison page's 28 matched
images, labels, zoom, full-width mode, both motion videos, eight benchmark rows
and narrow layout pass browser checks without page errors. This pass changes
crown shading; sparse unmapped woods, repeated forms and ground photo shadows
remain. Full functional flight tests were not rerun for this isolated visual pass.

Reproduce with the installed Playwright browser cache configured:

```sh
npm test
REVIEW_ROOT=/path/to/2dbf3a7 VISUAL_GPU=metal node test/woodland-lighting.mjs woodland-light-before
VISUAL_GPU=metal node test/woodland-lighting.mjs woodland-light-final
VISUAL_GPU=metal node test/woodland-coverage.mjs woodland-light-coverage
REVIEW_ROOT=/path/to/2dbf3a7 VISUAL_GPU=metal node test/tree-transitions.mjs woodland-light-motion-before
VISUAL_GPU=metal node test/tree-transitions.mjs woodland-light-motion
BENCHMARK_ROOT=/path/to/2dbf3a7 BENCHMARK_SCENES=captain-upper,roadside-homes,nearby,storm node test/render-benchmark.mjs woodland-light-baseline
BENCHMARK_SCENES=captain-upper,roadside-homes,nearby,storm node test/render-benchmark.mjs woodland-light-final
```

Raw records: `benchmarks/2026-10-19-woodland-light-render-before.json`,
`benchmarks/2026-10-19-woodland-light-render-first.json`,
`benchmarks/2026-10-19-woodland-light-render-final.json`,
`benchmarks/2026-10-19-woodland-light-captures.json`,
`benchmarks/2026-10-19-woodland-light-coverage.json`,
`benchmarks/2026-10-19-woodland-light-motion-before.json` and
`benchmarks/2026-10-19-woodland-light-motion-final.json`. The ignored local
`output/woodland-light-review.html` shows the scene and motion comparisons.


## Airport glazing and interior depth — 2026-10-20

Baseline `a4e2bad`, Apple M2 Pro / Chromium 141 ANGLE Metal. Matched 1440×900
views, fixed 1.5× high / 1× low, four seconds warm-up and twelve seconds sampling.
Physics is paused; visual updates run. GPU captures, videos and benchmarks were
sequential. The close-terminal pair was measured separately with the same settings.

| Tier / scene | Before FPS | After FPS | After p95 frame | Draw calls, unchanged | Triangles, unchanged |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain | 39.45 | 38.78 | 33.4 ms | 917 | 2,103,530 |
| high / rollout | 41.28 | 40.97 | 33.4 ms | 700 | 1,889,727 |
| high / terminal | 55.09 | 53.26 | 33.4 ms | 264 | 333,121 |
| high / terminal-close | 53.93 | 52.76 | 33.3 ms | 239 | 333,613 |
| high / storm | 40.31 | 40.31 | 33.4 ms | 917 | 2,119,833 |
| low / captain | 60.00 | 60.00 | 16.8 ms | 529 | 784,023 |
| low / rollout | 60.00 | 60.00 | 16.7 ms | 397 | 562,457 |
| low / terminal | 60.00 | 60.00 | 16.8 ms | 173 | 128,997 |
| low / terminal-close | 60.00 | 60.00 | 16.7 ms | 153 | 121,841 |
| low / storm | 60.00 | 60.00 | 16.7 ms | 513 | 796,964 |

High is 3.3% slower in the apron terminal view, 2.2% slower close to the windows,
1.7% slower in the captain view and 0.7% slower during rollout; storm is effectively
unchanged. These short measurements include normal run variation; they establish
neither zero cost nor a performance improvement. All sampled low views remain at
the approximately 60 FPS display limit. Forced 1.5× high still falls below 60 FPS.
Automatic quality adaptation is unchanged. Physical phones and other GPU/driver
combinations were not benchmarked.

The shader replaces two painted-interior texture reads with a bounded room
intersection and two simple seat/back box intersections. It adds no textures,
transparency passes, geometry or draws. Main hall and gallery fronts share rooms
across four panes; gaps are included so the room does not jump at a mullion.
Derivatives soften floor joints and ceiling strips, and signed epsilon guards
keep axis-aligned and grazing rays finite. Existing environment reflections and
shared atmospheric shading remain active. Interior lighting follows the existing
day/dusk/night intensities.

Removing the two generated colour/emission maps saves **1,398,101 bytes high /
349,525 bytes low** of estimated mipmapped GPU texture storage. Their CPU canvases
are removed too. Added per-pane attributes take **182,424 bytes** on either tier,
so net GPU storage falls by approximately **1.16 MiB high / 0.16 MiB low**, excluding
shader program storage. Sign-map storage is unchanged. No new model/image downloads
are required; the implementation adds a small JavaScript module. Architecture stays
at **33 draws**, **13,672 triangles high / 8,980 low** before frustum/shadow culling.

Validation: all 17 Node suites; matched airport captures on both tiers; finite,
nondegenerate geometry and valid room bases; all 120 front/rear hall rooms shared
by four adjoining panes; and operational clearances. The new real-material test
reads floating-point colour from six camera positions, including near-grazing
horizontal/vertical views with nonzero rendered pixels. Every value is finite and
bounded. The rear-wall board moves from 0.459 to 0.808 across normalized pane width
as the eye moves from one side to the other, establishing depth rather than only
an exposure change. A matched 180-frame / 100 m moving view has no page, shader or
asset errors. Captures include normal pilot views, close and oblique glazing,
overcast, night and storm. The full functional-flight suite was not rerun for this
isolated scenery-material change.

The effect is clearer near the terminal than through the forward windshield.
Rooms remain simplified opaque approximations, with sky-only reflections, simple
furnishings and existing coarse shadows. They are not walkable interiors or physical
transmission. The local `output/airport-glass-review.html` offers 56 before/after
images and the two motion videos, with measurements and these limitations.

Reproduce with the installed Playwright browser cache configured:

```sh
npm test
REVIEW_ROOT=/path/to/a4e2bad VISUAL_GPU=metal node test/airport-architecture.mjs airport-glass-before
VISUAL_GPU=metal node test/airport-architecture.mjs airport-glass-final
REVIEW_ROOT=/path/to/a4e2bad VISUAL_GPU=metal node test/airport-glass.mjs airport-glass-motion-before
VISUAL_GPU=metal node test/airport-glass.mjs airport-glass-motion-final
BENCHMARK_ROOT=/path/to/a4e2bad BENCHMARK_SCENES=captain,rollout,terminal,storm node test/render-benchmark.mjs airport-glass-before
BENCHMARK_SCENES=captain,rollout,terminal,storm node test/render-benchmark.mjs airport-glass-final
BENCHMARK_ROOT=/path/to/a4e2bad BENCHMARK_SCENES=terminal-close node test/render-benchmark.mjs airport-glass-close-before
BENCHMARK_SCENES=terminal-close node test/render-benchmark.mjs airport-glass-close-final
```

Raw records: `benchmarks/2026-10-20-airport-glass-render-before.json`,
`benchmarks/2026-10-20-airport-glass-render-final.json`,
`benchmarks/2026-10-20-airport-glass-close-render-before.json`,
`benchmarks/2026-10-20-airport-glass-close-render-final.json`,
`benchmarks/2026-10-20-airport-glass-captures.json`,
`benchmarks/2026-10-20-airport-glass-motion-before.json` and
`benchmarks/2026-10-20-airport-glass-motion-final.json`.


## Close grass, soil and leaf-litter surfaces — 2026-10-21

Baseline `ff17260`, Apple M2 Pro / Chromium 141 ANGLE Metal. The table compares
fresh runs of committed main and the final shader on October 21. Both use matched
1440×900 views, fixed 1.5× high / 1× low, four seconds of warm-up and twelve seconds
of sampling. Physics is paused; rendering and scenery updates run. GPU tests and
benchmarks ran sequentially. Earlier October 20 development measurements are not
the final comparison below.

| Tier / scene | Before FPS | After FPS | After p95 frame | Draw calls, unchanged | Triangles, unchanged |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain | 38.48 | 38.56 | 33.4 ms | 917 | 2,103,530 |
| high / grass-meadow | 42.47 | 40.45 | 33.4 ms | 305 | 923,542 |
| high / grass-soil | 45.38 | 43.69 | 33.4 ms | 311 | 2,235,268 |
| high / storm | 40.08 | 40.03 | 33.4 ms | 917 | 2,119,833 |
| low / captain | 60.00 | 60.00 | 16.7 ms | 529 | 784,023 |
| low / grass-meadow | 60.00 | 60.00 | 16.7 ms | 175 | 291,480 |
| low / grass-soil | 60.00 | 60.00 | 16.7 ms | 165 | 211,848 |
| low / storm | 51.76 | 46.77 | 33.4 ms | 513 | 796,964 |

High-tier FPS falls by 4.8% in the meadow and 3.7% over soil. The high captain
and storm measurements differ by less than 0.3%, within ordinary run variation.
Low clear scenes remain at the approximately 60 FPS display limit. The full-run
low storm result fell from 51.76 to 46.77 FPS; a targeted repeat reached 60.00 FPS
on both versions. Both records are retained: low storm pacing is variable, and this
comparison does not establish either a stable regression or zero cost there.
Forced 1.5× high remains below 60 FPS; automatic quality adaptation is unchanged.
These short, display-capped measurements are not uncapped GPU throughput or a
physical-phone benchmark.

Three CC0 scans supply grass, dry soil and leaf litter at physical scale. Their
colour, tangent normals and roughness share three blended, offset samples on a
triangular lattice. Quarter-turn rotations reduce aligned repetition without
per-sample trigonometry; normals rotate back into the terrain frame. Explicit
texture gradients preserve mip filtering across random offsets. Direct weighted
colour blending avoids amplifying mip-average differences into a lattice pattern.
The effect fades from 35 to 260 m and is limited to reviewed cover and airfield turf.
It adds no geometry, draw calls, render passes or physics work. It is primarily a
close-ground improvement: ordinary captain and forward rollout captures barely
change. Farther photographic blur, repeated tree forms, grass-card dither and
incomplete building coverage remain.

Three colour layers and four packed normal-X/normal-Y/roughness layers share two
texture arrays. The fourth surface layer replaces the old grass normal/roughness
maps, keeping the real shader at 15 fragment samplers high / 14 low on a 16-unit
renderer. All layers have independent mip chains. Downloads are 770,418 bytes high /
182,632 low instead of 504,796 bytes: net +265,622 / −322,164 bytes. Estimated RGBA8
mipmapped GPU storage falls from 10.67 MiB to 9.33 / 2.33 MiB. These are texture costs;
JavaScript, shader storage, temporary CPU decoding and other scenery are excluded.
Neither new texture is requested before the menu. A failed map leaves the existing
photographic ground visible with plain normals and records one asset error.

Validation: all 17 Node suites during this pass; nine matched views per tier;
nearby material contribution and distant fade; rain/night rendering; texture-unit
and download limits; and missing-map fallback. Six Float32 readbacks using the real
ground material, including near-grazing views, are finite, bounded and lit. Selected
corridor views retain clear field/building/road masks and their missing-mask fallback.
Two 180-update high-tier motion recordings cross 30 m of soil and meadow without
page, shader or asset errors. The local comparison page verifies 36 images, four
playable before/after videos, zoom, full-width after mode and a 390 px layout without
horizontal overflow. The full functional-flight suite was not rerun. Physical phones
and non-Metal renderers were not tested; SwiftShader cannot initialize here.

Reproduce with the installed Playwright browser cache configured:

```sh
npm test
REVIEW_ROOT=/path/to/ff17260 VISUAL_GPU=metal node test/ground-materials.mjs ground-material-before
VISUAL_GPU=metal node test/ground-materials.mjs ground-material-final
REVIEW_ROOT=/path/to/ff17260 VISUAL_GPU=metal node test/ground-material-motion.mjs ground-motion-before
VISUAL_GPU=metal node test/ground-material-motion.mjs ground-motion-final
REVIEW_VIEWS=field,opposite-field,captain-3400 VISUAL_GPU=metal node test/corridor-scenery.mjs ground-material-corridor
BENCHMARK_ROOT=/path/to/ff17260 BENCHMARK_SCENES=captain,grass-meadow,grass-soil,storm node test/render-benchmark.mjs ground-material-base
BENCHMARK_SCENES=captain,grass-meadow,grass-soil,storm node test/render-benchmark.mjs ground-material-final
```

Raw records: `benchmarks/2026-10-21-ground-material-render-before.json`,
`benchmarks/2026-10-21-ground-material-render-final.json`,
`benchmarks/2026-10-21-ground-material-storm-repeat-before.json`,
`benchmarks/2026-10-21-ground-material-storm-repeat-after.json`,
`benchmarks/2026-10-21-ground-material-captures.json`,
`benchmarks/2026-10-21-ground-material-corridor.json`,
`benchmarks/2026-10-21-ground-material-motion-before.json` and
`benchmarks/2026-10-21-ground-material-motion-final.json`. The ignored local
`output/ground-material-review.html` contains the complete before/after views,
recordings, measurements and limitations.

## Terrain-following canopy shade — 2026-10-21

Baseline: main `12bceb3`. The old horizontal radial contact planes are replaced with
alpha silhouettes from the already-loaded tree atlas, clipped to the actual terrain
triangles. Fixed tree and nearby-model budgets are unchanged; no asset download,
texture allocation, shadow-map pass or per-frame CPU projection is added.

Same M2 Pro / Chromium 141 / ANGLE Metal, sequential runs at 1440 × 900,
high 1.5× / low 1×, 4 s warmup and 12 s sampling. Physics is paused; rendering and
scenery updates are active. This measures steady-state pacing, not complete flight FPS.

| Tier / scene | Before FPS | After FPS | After p95 ms | Draw calls before → after | Extra rendered triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain | 38.7 | 37.9 | 33.4 | 917 → 918 | +62,119 |
| high / captain-upper | 36.7 | 35.6 | 33.4 | 1088 → 1088 | +144,747 |
| high / roadside-homes | 49.9 | 48.5 | 33.4 | 679 → 679 | +122,758 |
| high / storm | 40.1 | 39.9 | 33.4 | 917 → 918 | +46,192 |
| low / captain | 60.0 | 60.0 | 16.7 | 529 → 529 | +9,906 |
| low / captain-upper | 53.9 | 60.0 | 16.7 | 611 → 611 | +20,939 |
| low / roadside-homes | 60.0 | 60.0 | 16.7 | 441 → 441 | +20,809 |
| low / storm | 47.6 | 60.0 | 16.7 | 513 → 513 | +7,316 |

High clear views lost about 2–3% FPS in this short comparison; storm changed by less
than 1%. High p95 remained around 33.4 ms. Low was display-capped at 60 FPS in the
after run; baseline upper approach/storm varied at 53.9/47.6 FPS. That variation does
not demonstrate a code speedup. No physical phone or software renderer was measured.

The cost is additional terrain-fitting geometry, not free shading:

| Shade configuration | High triangles / buffer MiB | Low triangles / buffer MiB |
| --- | ---: | ---: |
| Before, all lighting | 104,000 / 3.17 | 28,000 / 0.85 |
| Clear | 378,821 / 17.54 | 56,380 / 2.50 |
| Dusk | 585,357 / 29.39 | 76,474 / 3.42 |
| Overcast | 307,349 / 13.94 | 49,241 / 2.18 |

These are total shadow geometry buffers (positions/UVs/indices after, instance matrices
before), not total process memory or just the currently visible triangles. GPU buffers
also retain CPU arrays. The high/low shade batches remain 109/28; frustum bounds can
change the visible draw count by one. At night they are hidden. Geometry is replaced
and old buffers disposed when the lighting configuration changes; it is not accumulated.

Measured CPU rebuilds were about 400 ms high / 59 ms low for clear, 601 / 70 ms for
dusk and 276 / 41 ms for overcast. Initial preparation happens behind the menu; a
lighting/scenario change rebuilds synchronously and can pause briefly. GPU upload time
is additional and is not isolated by this measurement. This remains a setup cost to
improve; the steady-state FPS table must not be read as a loading-stall measurement.

The CPU test exercises 16,043 clipped triangles on both terrain tiers and three sun
angles: interior heights match the rendered terrain to floating-point precision, and
clipping neither duplicates nor loses area. The old flat-patch fixtures differed by up
to 7.81 m on slopes. Real-scene browser checks show visible darkening on both tiers,
weaker overcast shade, zero brightened pixels in the sampled views and no contribution
at night. Separate crown-direction lighting checks continue to pass.

Reports: `benchmarks/2026-10-21-woodland-shadows-{render-before,render-after,close-before,close-after}.json`.
Local full-frame comparison: [canopy shade](output/woodland-shadow-review.html).
This does not remove baked photographic shadows, improve tree silhouettes, or cast
shadows on other trees, buildings or raised site surfaces.

## Start without canopy rebuilds; cockpit wear behind the menu — 2026-10-21

Review follow-up to the four entries above. Measured in a 4-vCPU cloud container with
Chromium and SwiftShader, not on the M2 Pro: compare the before/after columns, not
their absolute values with the tables above.

Canopy shade is now sunlight only. It is hidden at night, as before, and also on ground
below an overcast deck, where it previously switched to a weaker top-view variant. The
sunlit geometry is kept while hidden, so a change of weather no longer rebuilds it when a
flight starts. No current scenario has sunlight from another direction (storm, the only
dusk scenario, is below a deck), so the shade is built once, behind the menu. The
13.9 / 2.2 MiB overcast geometry is no longer created. Matched overcast captures change by
0.05 high / 0.02 low mean grey levels; sunlit captures are unchanged.

| Synchronous Start, by scenario sequence | Before | After | `0b14a19` |
| --- | ---: | ---: | ---: |
| High: crosswind, clear, tailwind (weather class changes) | 492–740 ms | 4–19 ms | 2–11 ms |
| High: storm / the clear flight after it | 941 / 787 ms | 319 / 150 ms | 286 / 117 ms |
| Low: crosswind, clear, tailwind | 82–101 ms | 3–8 ms | 4–10 ms |
| Low: storm / the clear flight after it | 282 / 238 ms | 249 / 147 ms | 209 / 116 ms |

The cockpit's part-fitted wear mask is now a scenery job, requested after the menu
appears. Until it arrives, or if it fails, the masked materials share a 1×1 float texel
that leaves colour, roughness and relief unchanged; the real mask then replaces the
shared uniform's texture without recompiling shaders. Startup downloads fall from
14,518,534 to 14,210,032 bytes high and from 8,806,419 to 8,674,145 bytes low (790 KB /
326 KB below the 15 / 9 MB limits). A flight still downloads nothing, and cockpit captures
after preparation match the earlier ones (≤ 0.06 mean grey levels, animated lights/rain).

Test changes: `airport-glass.mjs` draws only its three sampled motion frames unless it is
recording, as `ground-material-motion.mjs` does (2 min instead of over 25 min with
SwiftShader); `cockpit-surfaces.mjs` reads back one pixel before each screenshot, which
otherwise timed out with SwiftShader on unmodified main too. `delivery.mjs` asserts that the
wear mask is not requested before the menu; `woodland-shadows.mjs` asserts no shade and no
rebuild under overcast. The CPU terrain-fit test now covers sunlit footprints only (8,819
clipped triangles instead of 16,043).

Validation: all Node suites; delivery; cockpit surfaces, cockpit lighting (including the
missing-file fallback), phone cockpit, canopy shade and airport glass in SwiftShader; and
the full browser functional suite.

## Connected approach crossing — 2026-10-22

Compared published main `9c30fd6` with the completed crossing neighborhood. Apple M2 Pro,
private Chromium ANGLE Metal, 1440 × 900 viewport, high at fixed 1.5× / low at 1×.
Four-second warm-up and twelve-second samples per view, run sequentially. This measures
RAF pacing with renderer/scenery updates and paused physics; it is not a complete flight
benchmark. Assets are settled before sampling. The crossing camera is a wide exterior view;
`captain-upper` is the unchanged cockpit at x=5500 m on the three-degree approach.

| Tier / scene | Before FPS | After FPS | After p95 ms | Draw calls before → after | Extra rendered triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain | 38.2 | 38.9 | 33.4 | 918 → 918 | −1,310 |
| high / captain-upper | 36.2 | 34.3 | 33.4 | 1088 → 1104 | +127,062 |
| high / crossing | 50.5 | 45.8 | 33.4 | 695 → 711 | +128,598 |
| high / storm | 40.6 | 40.7 | 33.4 | 873 → 873 | −298 |
| low / captain | 60.0 | 60.0 | 16.8 | 529 → 529 | −608 |
| low / captain-upper | 59.9 | 60.0 | 16.7 | 611 → 634 | +138,762 |
| low / crossing | 60.0 | 60.0 | 16.7 | 451 → 474 | +138,834 |
| low / storm | 56.4 | 60.0 | 16.7 | 499 → 499 | −206 |

The added neighborhood costs about **5% FPS in the upper cockpit view and 9% in the wide
crossing view on high**. The shorter captain/storm views change little. Low remains at
the 60 FPS display cap; the faster storm result is run-to-run variation, not evidence of
a code speedup. These results do not establish performance on a physical phone, an ordinary
laptop or another GPU driver. Adaptive quality remains necessary for slower hardware.

There are 27 additional complete building placements, bringing the total to 62 across eight
sites. Building triangles rise 92,375 → 133,587; site grounds/fences 175,866 → 273,132, plus
the unchanged 2,924-triangle original yard. The three adjacent crossing groups share building
material batches, removing 20 draws versus separate groups without changing geometry.
Total site batches are 65 → 88, before subtracting replaced procedural facade draws.
The transfer increase is geometry and site data; texture counts/resolutions are unchanged.

Four additional interpreted cover polygons add 20.47 ha, bringing total mapped cover to
930.74 ha. A fifth central planting zone has a 700 / 300 high/low allocation; older zone
bounds/seeds/caps are preserved. This allocation replaces wider photo-selected trees within
the unchanged **52,000 / 14,000** instance budgets. Redistribution slightly changes visible
trees and shadow geometry outside the new neighborhood too. The exact CPU mask and GPU
dimensions are unchanged; the PNG uses stronger lossless compression.

| Delivered asset | Before bytes | After bytes |
| --- | ---: | ---: |
| Complete buildings, high | 2,179,844 | 2,893,360 |
| Complete buildings, low | 1,733,232 | 2,446,804 |
| Approach site data | 50,036 | 84,349 |
| Building manifest | 15,604 | 23,460 |
| Cover PNG + JSON | 435,319 | 303,681 |

Net added transfer is **624,047 bytes high / 624,103 low**, loaded during preparation behind
the menu. Unused Blender child/mesh/accessor labels are omitted from the GLBs; runtime
building IDs, material names and geometry/texture precision are retained. Low retains the
same complete-building geometry as high, with smaller textures.

The delivery browser check measured **14,210,244 / 8,674,357 bytes** to the menu and
**65,668,574 / 19,013,457 bytes** after full preparation, high / low. Startup remains below
the 15 / 9 MB limits; compared with the previous delivery report, it rises by only 212 bytes
of loader code. Starting a flight requests no additional assets. Hidden-tab calibration,
slow-device automatic low selection and low-tier terrain registration still pass.

Validation: all 18 Node suites; both-tier approach-site roof/contact/road/tree checks and
missing/invalid extension fallbacks; both-tier corridor ground contribution, allocation,
field/road/building clearance and missing-mask fallback; authored-scenery material/atmosphere
checks and missing model/material/site-data fallbacks; delivery and automatic quality checks.
The local comparison page also passes image-loading, slider-direction and small-layout checks.
The full functional flight suite,
SwiftShader and physical phones were not repeated for this scenery-only pass.

Reports: `benchmarks/2026-10-22-approach-crossing-{render-before,render-after,sites,corridor,authored,delivery}.json`.
Local [matched full-frame review](output/approach-crossing-review.html) includes three ordinary
pilot positions as well as the wide/close views, overcast and night. The strongest gain is
the continuous wooded/inhabited stretch; the straight-ahead cockpit change is modest because
the glareshield hides most nearby buildings. Other approach areas, distant tree forms and
photographic shadows remain incomplete.


## Pilot-visible hillside and distant building trim — 2026-10-23

Compared published main `9c135d2` with the hillside extension. Apple M2 Pro, private
Chromium ANGLE Metal, 1440 × 900, high fixed at 1.5× and low at 1×. Four-second warm-up,
twelve-second samples, all GPU jobs sequential. Renderer/scenery updates with paused
physics and settled assets; RAF pacing is display-capped. This is not a full-flight or
physical-phone benchmark. `captain-valley` and `captain-upper` use the unchanged pilot
camera at x=7500 and 5500 m. `hills` is the wider inspection camera at (5200,380,600).

First matched run, retained in full, including variable low-tier results:

| Tier / scene | Before FPS | After FPS | After p95 ms | Draw calls before → after | Rendered triangle change |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain-valley | 32.78 | 33.37 | 33.4 | 1249 → 1241 | -5,640 |
| high / captain-upper | 32.99 | 33.99 | 33.4 | 1104 → 1098 | +5,375 |
| high / captain | 37.73 | 38.73 | 33.4 | 918 → 912 | -8,816 |
| high / storm | 39.53 | 40.64 | 33.4 | 873 → 870 | -7,706 |
| high / hills | 50.21 | 50.03 | 33.4 | 474 → 470 | +42,890 |
| low / captain-valley | 60.00 | 60.00 | 16.8 | 690 → 686 | -33,662 |
| low / captain-upper | 56.92 | 51.26 | 33.4 | 634 → 630 | -17,950 |
| low / captain | 49.93 | 49.60 | 33.4 | 529 → 521 | -6,791 |
| low / storm | 60.00 | 48.27 | 33.4 | 499 → 495 | -6,942 |
| low / hills | 59.67 | 60.00 | 16.8 | 310 → 307 | -1,771 |

High-tier FPS is within −0.4% to +3.0% of baseline. That is broadly similar pacing,
not evidence of a general speedup. The wider hillside adds 42,890 rendered triangles
on high, while distant trim removes geometry elsewhere. Total draw calls fall modestly.

Low-tier timings vary enough that the first apparent regressions need qualification.
Repeating the two cockpit scenes in reverse build order gave:

| Low scene | Before FPS | After FPS | Before / after p95 ms |
| --- | ---: | ---: | ---: |
| Middle approach (`captain-upper`) | 60.00 | 60.00 | 16.7 / 16.7 |
| Short final (`captain`) | 55.67 | 55.43 | 33.3 / 33.3 |

Three additional consecutive storm samples, after build first and baseline second,
measured **60.00 / 56.01 / 48.37 FPS after** and **60.00 / 54.43 / 58.59 before**.
Both builds fluctuate, and the third after sample is slower. These measurements do not
establish a stable low-tier regression or stable equivalence under sustained load. The
raw results remain available; do not replace them with a claim of “60 FPS on low”.
Wider hardware and longer sustained-flight measurements remain outstanding. Adaptive
quality is unchanged.

### Geometry, memory and delivery

- The hillside reuses the bundled final-approach imagery and tree palette. Its weighted
  cover is 381.06 ha woodland plus 25.26 ha meadow: combined interpreted cover 1337.06 ha.
  Six clearings stay open; road and building clearances remain. The original 3450 × 1015
  close-mask pixels are byte-identical. Previous mapped planting allocations are unchanged.
- A sixth allocation receives 8000 / 1000 high/low trees, uniformly thinned from 16 / 32 m
  candidate spacing. Total instances remain 52,000 / 14,000. Mapped and placed trees use
  48,706 / 13,766 of that budget, leaving 3294 / 234 wider photo-selected trees. This shifts
  background density and some near-tree selections rather than adding unlimited coverage.
- The separate 1024 × 256 hill tile is packed below the close mask. One sampler and one
  selected-region texture lookup remain. The combined atlas is 3450 × 1271 high and
  2048 × 754 low. RGBA8 GPU bytes increase 14,007,000 → 17,539,800 high and
  4,939,776 → 6,176,768 low. CPU placement adds 524,288 packed bytes; the old buffer remains.
- The PNG/JSON pair increases 303,681 → 321,536 bytes (**+17,855**). Runtime code adds
  4776 bytes. Total delivered increase is **22,631 bytes** per tier; no new imagery,
  models or material textures. Delivery measures 14,215,020 / 8,679,133 bytes to the menu
  and 65,691,205 / 19,036,088 after preparation. Startup remains below 15 / 9 MB; no new
  resources are requested when the flight starts.
- Complete buildings retain 133,587 near triangles and use 98,250 far triangles, 26.5%
  fewer. Only painted/ironwork triangles smaller than 0.08 m² are removed. Walls, roofs,
  glass and substantial trim retain geometry and materials. Far levels share vertex
  attributes and add indices. The switch occurs beyond bounding radius + 550 m, with
  12% hysteresis on return. Building models, 62 placements, eight sites and ground geometry
  are unchanged. This is not a 26.5% reduction in whole-scene rendering cost.

### Validation and remaining limits

All 18 Node suites pass. Hardware browser checks pass for both land-cover tiers, field/
road/building clearances, visible ground contribution and missing/invalid atlas fallback.
All six building groups retain structural surfaces and pass level/hysteresis checks.
At the visible crossing transition, pixels changing by more than 12 grey levels comprise
0.0119% high / 0.0066% low of the full frame. The near/far mean RGB difference is
0.0059 / 0.0019 on the 0–255 scale. Other distances and thin silhouettes can still shimmer.

The existing authored material/atmosphere checks, 64 roof samples, terrain contact,
35 local and 16 main-road connections, asset fallbacks and delivery/automatic quality
checks also pass. A matched 480-frame normal-pilot descent was recorded from x=6800 to
6201 m at high 1×, with no renderer errors. Encoding alters pacing, so those clips are
visual evidence, not benchmark results. The full functional flight suite, SwiftShader
and physical phones were not repeated for this pass.

The gain is wooded coverage in the left windshield; the runway and cockpit are unchanged.
Low-tier woods remain sparse, distant crowns retain image planes and repeated forms, and
unmapped hills remain photographic. The fixed tree budget means less random planting
outside the mapped areas. This does not complete the scenery or vegetation categories.

Reports: `benchmarks/2026-10-23-approach-hills-*.json`, including both raw render comparisons,
repeated low-tier samples, scenery/corridor/authored/site/delivery checks and motion metadata.
Local [pilot and hillside comparison](output/approach-hills-review.html) includes both tiers,
nine matched views, overcast/night and the moving pilot-camera pair.

### Review follow-up: hillside join, low tier and portable checks — 2026-10-23

The review found a straight treeless band where the close map met the hill tile (both
faded there; cover stayed below 0.15 over z≈1012–1041), a density step at that line, a
low tier that spent 1000 of its 14,000 trees on the hillside, and two checks fixed to Metal.

- The bake now carries the hill tile's cover into the close map's last 30 m and drops
  both fades at the shared edge. Only the close map's last 15 rows change, within the hill
  tile's x range. A 6-row gutter of repeated edge rows separates the two maps in the atlas,
  so bilinear filtering and the low tier's downscale never blend them. Weighted cover is
  936.40 + 411.36 = **1347.76 ha** (was 1337.06). The PNG/JSON pair grows 321,536 →
  **323,856 bytes** (+2,320).
- High quality: the atlas is 3450 × 1277 (17,622,600 RGBA8 bytes, +82,800 for the gutter).
  The hillside's 8000 trees thin over 200 m from the join down to 30 % of the close woods'
  density, from 13 m candidates, and systematic sampling fills exactly the allocation. In
  40 m strips either side of the join (x=4200–5000) there are 201 close / 164 hill trees;
  the hills-scenery check requires at least 70 %. The tile holds 7932 tree cards and the
  airport side 559 (8023 / 557 in the first version).
- Low quality uses no hill tile: no hill trees, tint, upload or CPU samples. The texture
  returns to the close map alone, 2048 × 603 (4,939,776 bytes, down from 6,176,768), and
  the airport side keeps 152 trees instead of 29 (189 before the hillside pass). In the
  same oblique view, the low tier's woods end at z=1030 against the leaf-off photograph
  as they did before the hillside pass.
- `hills-scenery` and `hills-motion` default to SwiftShader with the standard flags
  (`VISUAL_GPU=metal` for hardware). Under software rendering the motion check draws only
  its three sampled frames and records no video (121 s here); hardware still records.

SwiftShader results: hills-scenery (458 s), corridor-scenery, hills-motion, woodland
coverage/shadows, approach-scenery, approach-sites and delivery pass, as do all Node suites.
Delivery measures 14,236,167 / 8,700,280 bytes to the menu and 65,714,672 / 19,059,555
after preparation; this branch also carries the flight-model tables, so the increase over
the hillside pass is not this change alone. No frame-rate measurements were repeated:
tree instance counts are unchanged, texture memory falls on low and grows by the gutter
rows on high, and the M2 Pro figures above still describe the first version.

### Low-tier outer-edge fade — 2026-10-23

Baseline `bcfb2cd`. Low quality omits the hill tile, so the unfeathered shared edge
created a straight cutoff. The loader now fades the close mask over its last 160 m
beside that absent tile, with blended lateral ends, before packing CPU placement data
and filtering the GPU upload. The source asset and high-tier path are unchanged.

Cost: one extra load-time pass over 134,400 RGBA pixels (RGB edited, alpha retained)
and a canvas write. No new asset bytes, persistent buffers, texture storage, samplers,
rendering passes or per-frame shader work are added. The total tree instances remain
52,000 / 14,000, and texture dimensions remain 3450 × 1277 / 2048 × 603. Existing
zone seeds/caps are retained; low-tier individual positions can change with selection.

All 19 Node suites and both-tier Chromium Metal hillside/corridor checks pass.
The sampled CPU/GPU coverage differs by at most 1/255. Four matched high-tier images
are pixel-identical to `bcfb2cd`; low-tier images show the tapered edge. Raw reports:
`benchmarks/2026-10-23-low-tier-edge-*.json`. No FPS benchmark was repeated, so this
correction does not establish new frame-rate or physical-phone performance claims.


## Valley lane farm and homes — 2026-10-24

Compared published main `07530bb` with 19 additional complete buildings and two connected
sites. Apple M2 Pro, Chromium ANGLE Metal, 1440 × 900, high at 1.5× / low at 1×.
Four-second warm-up, twelve-second samples, paused physics; assets prepared before
sampling. RAF timing is display capped. These are rendering/scenery-update measurements,
not a full-flight or physical-phone benchmark. Baseline and changed runs were sequential.

| Tier / scene | Before FPS | After FPS | After p95 ms | Draw calls | Triangle change |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain-4300 | 36.5 | 36.2 | 33.4 | 995 → 1008 | +93,897 |
| high / valley-lane-wide | 55.4 | 53.5 | 33.3 | 515 → 528 | +95,403 |
| high / valley-lane-farm | 54.2 | 49.9 | 33.4 | 400 → 414 | +56,580 |
| low / captain-4300 | 60.0 | 60.0 | 16.7 | 558 → 576 | +95,643 |
| low / valley-lane-wide | 60.0 | 60.0 | 16.7 | 359 → 377 | +105,933 |
| low / valley-lane-farm | 60.0 | 60.0 | 16.8 | 252 → 266 | +63,210 |

The ordinary captain sample changes by −0.6%; the wide view by −3.5%; the close farm
view by −8.0% on high. Low remains around the 60 FPS display limit. The new grounds
and buildings have a measured cost, particularly in the exterior view; this is not
a performance improvement or proof of sustained 60 FPS on high. GPU/thermal variance
and the short sampling window limit the conclusions. Adaptive quality remains enabled
in ordinary play; these fixed-resolution comparisons do not exercise its adjustments.

The new sites share a building material group and inherit the existing far-detail level.
Complete buildings: 133,587 → 160,949 near / 98,250 → 115,274 far triangles. Grounds and
fences: 273,132 → 352,486, with the original 2,924-triangle yard unchanged. Site batches:
88 → 106, before subtracting replaced procedural buildings. No new shader, texture
sampler, land-cover mask or source texture is introduced. Total tree budgets remain
52,000 / 14,000; 76 eligible planted site trees replace the previous 66. New yard
exclusions redistribute some candidates within the existing seeded planting zones.

Transfer including the manifest increases 527,024 / 526,900 bytes high/low. Startup
remains 14,237,416 / 8,701,529 bytes; prepared assets total 66,242,945 / 19,587,704 bytes.
The delivery check reports no requests after the short flight starts and passes slow
automatic-tier selection and hidden-tab calibration checks. No new scenery streams
into this flight after takeoff.

All 19 Node suites pass. Both tiers pass 85 roof samples, two open-courtyard checks,
54 local access joins, 25 main-road joins and terrain contact (maximum error 0.034 mm),
with no unplanned trees in the sites or road/building intrusions. Authored material
atmosphere binding and missing model/material/site fallbacks pass. Corridor checks
retain field clearance, planting limits and missing-mask fallback. Full functional flight
tests, SwiftShader and physical devices were not repeated for this scenery pass.

A matched 480-frame normal pilot descent from x=4300 to 3701.25 m is recorded at high
1×. Video encoding changes frame cost; those clips are visual evidence only. The high
normal-view changed area is 0.76% at x=4300 and 0.004% at x=3500 (pixels differing by
more than 12 grey levels). These are not quality scores: the improvement is mostly in
small scenery through the left window, with much of the nearby area below the glareshield.
The wide and close scenery views make the grounds and roof changes easier to inspect.

Reports: `benchmarks/2026-10-24-valley-lane-*.json`. Local
[matched scenery and motion review](output/valley-lane-review.html). Geometry and grounds
remain interpreted and simplified; photographic ground/shadows and repeated tree cards
persist beyond the treated surfaces.

## Opposite hillside and field margins — 2026-10-24

Baseline: main `09c7c36`. Chromium 141, ANGLE Metal / Apple M2 Pro, 1440 × 900,
fixed high 1.5× and low 1×. Four-second warm-up, twelve-second samples, paused physics;
RAF pacing is display capped and CPU times exclude asynchronous GPU work. Ordinary
play retains adaptive quality. No other browser graphics job ran concurrently.

| Tier / scene | Before → after FPS | After p95 ms | Draw calls | Rendered triangles |
| --- | --- | --- | --- | --- |
| high / captain-5500 | 33.1 → 33.4 | 33.4 | 1116 → 1122 | 2,741,230 → 2,793,026 |
| high / captain-4300 | 36.0 → 36.0 | 33.4 | 1008 → 1013 | 2,416,820 → 2,449,552 |
| high / opposite-hills | 57.1 → 55.5 | 33.3 | 384 → 390 | 767,440 → 820,446 |
| low / captain-5500 | 60.0 → 60.0 | 16.7 | 652 → 652 | 1,217,793 → 1,217,793 |
| low / captain-4300 | 60.0 → 55.8 | 33.3 | 576 → 576 | 975,864 → 975,864 |
| low / opposite-hills | 60.0 → 60.0 | 16.8 | 232 → 232 | 395,018 → 395,018 |

High's ordinary captain samples change +0.9% / +0.05%; the wide hillside sample
changes −2.7%. This is a modest measured exterior cost, with additional geometry
and CPU work even where display-paced FPS is unchanged. The initial low x=4300
sample falls to 55.8 FPS despite identical captured pixels and geometry. A subsequent
matched repeat reaches **60.0 → 60.0 FPS**. Both initial and repeat reports
are retained; these short samples do not establish stable performance on other hardware.

The high tree total rises 52,000 → 58,000. A separate 6000-tree allocation preserves
older zone caps and the wider background allowance. The new join changes candidate
selection in the first 30 m of the old north edge, including 3440 → 3428 candidates
in the upper-opposite zone; background filling makes up the difference. Tree cards
and terrain-following footprint shadows both contribute to the measured cost. Low
remains at 14,000 trees, with all seven reviewed images pixel-identical to baseline.

The new 1024 × 256 cover tile occupies unused atlas columns. Uploaded sizes stay
3450 × 1277 high / 2048 × 603 low (17.62 / 4.94 MB RGBA8); no sampler or render pass
is added. Packed high CPU cover grows by 0.52 MB. A joined high canvas replaces the
original decoded image as the texture upload source; it is retained for texture
lifetime. The map/manifest pair adds **42,352 bytes** on both tiers. No new models,
source imagery, PBR maps or tree forms are downloaded.

All 19 Node suites pass. Both-tier corridor checks pass prior field/stand coverage,
road/building clearance and missing-map fallback. New hillside checks pass continuous
CPU/uploaded cover, adjacent-strip density, open fields and invalid-atlas fallback.
The retained left hillside and far-building detail checks pass after correcting the
test's fractional reconstruction of an integer image-row count.

The [matched review](output/opposite-hills-review.html) includes normal pilot views,
the slope, farmland, overcast and night. High captain change areas are 0.71%, 0.91%,
1.30% at x=6500, 5500, 4300 m; the wide view is 12.52% (pixels differing by >12 grey
levels). These quantify changed area, not photorealism. The 480-frame normal pilot
motion comparison at 1× covers x=5500 → 4901.25 m; recording adds encoding overhead
and is separate from these benchmarks.

Reports: `benchmarks/2026-10-24-opposite-hills-*.json`. Farther upper flanks and
low-tier outer hills remain photographic. Distant tree cards, repeated silhouettes,
blurred fields and procedural houses remain visible limits.

Software compatibility was attempted at 1440 × 900 and 640 × 400. The configured
Chromium SwiftShader backend fails before scenery setup with `BindToCurrentSequence
failed` / `Error creating WebGL context`. Pausing drawing at `sim-ready` also exposed
the same failure; the new check now exits promptly on a boot error rather than waiting
for readiness to time out. This is unavailable validation, not a passing software test.
Physical phones and the complete functional flight suite were not rerun for this pass.

Delivery validation passes with startup **14,241,604 / 8,705,717 bytes** and prepared
assets **66,289,485 / 19,634,244 bytes** (high / low). The short flight adds no requests;
slow automatic-tier selection and hidden-tab calibration checks pass. Both startup
budgets remain below 15 / 9 MB. The isolated new-material toggle changes the wide
view by a mean 1.22 grey levels on Metal, confirming the atlas tile reaches the
terrain shader. All 28 comparison images, slider direction controls and the phone
review-page layout pass.

## Connected upper approach slopes — 2026-10-25

Baseline: published main `2b627a3`. Chromium 141, ANGLE Metal / Apple M2 Pro,
1440 × 900; fixed high 1.5× and low 1×. Four-second warm-up, twelve-second samples,
paused physics. RAF pacing is display capped; CPU times exclude asynchronous GPU
work. Ordinary play retains adaptive resolution. No other graphics job ran during
the baseline, repeat baseline or final benchmark.

| Tier / scene | Before → final FPS | Final p95 ms | Draw calls | Rendered triangles |
| --- | --- | --- | --- | --- |
| high / captain-9000 | 32.3 → 32.4 | 33.4 | 1,333 → 1,331 | 3,165,399 → 3,216,013 |
| high / captain-7500 | 32.9 → 33.4 | 33.4 | 1,265 → 1,263 | 3,024,841 → 3,049,345 |
| high / upper-slopes-north | 49.1 → 49.1 | 33.4 | 849 → 851 | 1,619,726 → 1,657,913 |
| high / upper-slopes-south | 49.5 → 48.9 | 33.4 | 761 → 762 | 1,442,213 → 1,482,967 |
| low / captain-9000 | 60.0 → 60.0 | 16.7 | 738 → 738 | 1,280,764 → 1,280,764 |
| low / captain-7500 | 59.6 → 60.0 | 16.8 | 708 → 708 | 1,253,118 → 1,253,118 |
| low / upper-slopes-north | 60.0 → 60.0 | 16.8 | 536 → 536 | 851,222 → 851,222 |
| low / upper-slopes-south | 60.0 → 60.0 | 16.8 | 505 → 505 | 741,550 → 741,550 |

The pilot views remain within ordinary run variation. The south exterior changes
−1.2%, north is essentially unchanged. This adds rendering work despite similar FPS:
8,000 more high-tier trees and their terrain-following shadows add approximately
25,000–51,000 rendered triangles in the sampled views. Spatial batching and changed
background distribution mean draw calls can decrease even with more total trees.
Low has identical draw/triangle counts and all seven matched captures are pixel-identical.

The initial terrain shader used a loop over the two new strips and always read the
base map. It measured **25.8 / 26.7 FPS** in the pilot views and **33.9 / 36.9 FPS**
in north/south exteriors; its unchanged low views also slowed. A repeated baseline
returned **33.5 FPS cockpit / 50.6 north**, with low near 60. The final shader selects
the strip by Z explicitly, avoids dynamic array indexing, and only reads both maps
within an overlap. Final measurements are in the table. The initial run included a
brief CPU-only area/difference calculation; the repeat baseline and final measurements
had no such work. Both initial and repeat reports remain available instead of being
replaced by the faster result. These short samples do not certify other machines.

Two 692 × 256 maps occupy unused atlas columns at x=2060 / 2758. Upload dimensions
remain **3450 × 1277 high / 2048 × 603 low**, or **17.62 / 4.94 MB** RGBA8. Packed
CPU cover increases by **708,608 bytes**, plus mixed-pixel tables. No new source
image/model, sampler, terrain mesh or terrain draw pass. The PNG/JSON pair grows
**366,208 → 411,261 bytes**; original tracing coordinates remain in the tools.

High allocations are 3500 north / 4500 south, giving **66,000 total**. Earlier caps,
seeds and bounds are retained, but changed cover within 180 m overlaps affects
candidate selection. The old upper-opposite zone now fills 3500 versus 3428; the
checked old north/south slopes retain 6246 / 7932 trees. Background airport-side
planting becomes 876 versus 613. The new slopes contain 3689 / 4519 trees including
background entries. Low retains 14,000 total and 151 airport-side background trees.

CPU planting and the real uploaded GLSL agree at 31 sampled joins/land-use points.
The three older baked maps are byte-identical. Net new coverage is **833.20 ha**,
computed by integrating the combined maps at 2 m spacing; overlap is not counted twice.
Field/road/building clearance, retained hill/low-fade checks, original field material
contribution, missing-mask fallback and invalid new atlas tests pass on Metal.
All 19 Node suites pass. Physical phones, other GPUs, SwiftShader and the complete
functional flight suite were not rerun. SwiftShader failed to create a WebGL context
in the preceding pass on this Mac; this pass makes no software-renderer claim.

Delivery: startup **14,246,102 / 8,710,215 bytes** and prepared **66,339,036 /
19,683,795 bytes** (high / low). Both startup budgets remain below 15 / 9 MB.
No new requests occur after the short flight starts. Slow automatic selection,
hidden-tab calibration and quality-fallback terrain registration pass.

Matched 480-frame pilot descent recordings at high 1× run from x=9000 → 8401.25 m
without rendering errors. They are visual evidence, not FPS tests. The overcast review
camera sits 100 m below the cloud base; before/after capture sequences retain equal
extra render counts for material-isolation checks so cloud jitter phases match.
All 28 review images, slider controls and phone review-page layout pass.

[Scenery and motion comparison](output/upper-slopes-review.html). Evidence:
`benchmarks/2026-10-25-upper-slopes-*.json`. Sparse/repeated tree silhouettes,
photographic shadows, simple houses, airport-side countryside and land beyond the
mapped bounds remain visible limits.


## Airport countryside — 2026-10-26

Baseline: main `8f492ad`. Apple M2 Pro, Chromium 141.0.7390.37, ANGLE Metal,
1440 × 900, high 1.5× / low 1×, four-second warm-up and twelve-second samples,
paused physics. Browser measurement jobs ran sequentially.

| Tier / scene | Before → after FPS | After p95 ms | Draw calls | Rendered triangles |
| --- | --- | --- | --- | --- |
| high / captain-4000 | 37.6 → 37.4 | 33.4 | 999 → 1,003 | 2,388,519 → 2,426,517 |
| high / captain-3000 | 41.0 → 41.6 | 33.4 | 885 → 889 | 2,112,739 → 2,144,087 |
| high / airport-country-north | 59.3 → 57.8 | 16.8 | 317 → 319 | 552,134 → 571,119 |
| high / airport-country-south | 60.0 → 60.0 | 16.8 | 390 → 392 | 447,068 → 466,391 |
| low / captain-4000 | 60.0 → 60.0 | 16.7 | 567 → 567 | 910,760 → 910,760 |
| low / captain-3000 | 60.0 → 57.7 | 16.8 | 524 → 524 | 789,093 → 789,093 |
| low / airport-country-north | 60.0 → 60.0 | 16.8 | 192 → 192 | 191,817 → 191,817 |
| low / airport-country-south | 60.0 → 60.0 | 16.8 | 262 → 262 | 163,139 → 163,139 |

Cockpit results are within ordinary short-run variation. North exterior slows about
2.5%; the south remains display-capped. The change adds 4000 trees and their ground
shade, with roughly 19,000–38,000 extra rendered triangles in these views and 2–4
more draw calls. This is added work, not a performance improvement.

The low captain-3000 sample measured 57.7 FPS; an isolated repeat without code
changes measured 60.0 FPS (p95 16.7 ms). Its draw calls and triangles
match the baseline. Both original and repeat reports are retained, and all seven
matched low images are pixel-identical. Other low samples remain at about 60 FPS.

The optional PNG/JSON adds **39,791 bytes on high only**. The previous atlas is
unchanged; a new 640 × 768 RGBA8 texture adds **1,966,080 bytes** of GPU storage and
**983,040 bytes** of packed CPU coverage, plus mixed-pixel records. One extra sampler
is read only inside the airport rectangle. Within the 180 m east overlap, the
shader also samples the earlier map. No extra terrain mesh or draw pass is added.
Low requests neither airport data file; the small runtime module is shared.

High reaches 70,000 trees; low retains 14,000. Earlier zone caps/seeds remain, though
accepted candidates within the overlap and background placement can change.
Airport protection now includes a 24 m margin and a 110 m fade. Net coverage adds
609.33 ha after subtracting old cover in the overlap, about 3074.79 ha total.
The previous five baked maps remain byte-identical. CPU and actual GPU output agree
at 31 checked points. Invalid/missing airport data retains earlier ground and
66,000 high trees. All 20 Node suites pass.

Retained-field checks pass on both tiers, including the older missing-mask fallback.
Delivery passes with startup **14,250,643 / 8,714,756 bytes**, prepared **66,383,368 /
19,688,336 bytes** high / low. Compared with the preceding pass, the prepared increase
is 44,332 high / 4,541 low: the new 39,791-byte asset pair plus shared runtime code.
Low requests neither airport asset. No requests occur during the short test flight.
Automatic low selection and hidden-tab calibration still pass.

Matched 480-frame pilot descents at high 1× cover x=3600 → 3001.25 m without renderer
errors. These recordings are visual evidence; encoding affects pacing. All 28 review
images, two video metadata loads, controls and phone review-page layout pass.

Physical phones, other GPUs, SwiftShader and the full functional flight suite were
not rerun. The earlier local SwiftShader context-creation failure is not a pass.
Sparse/repeated crowns, photographic ground/shadows and basic rural buildings remain
visible limitations. [Scenery comparison](output/airport-countryside-review.html);
evidence: `benchmarks/2026-10-26-airport-countryside-*.json`.

## Retained broadleaf foliage — 2026-10-26

Baseline `5967d47`; same Apple M2 Pro / Chromium 141 / ANGLE Metal renderer,
1440 × 900, high 1.5× / low 1×, four-second warm-up and twelve-second samples.
Physics is paused; scenery updates and rendering run, with the nearby camera moving
30 m during each sample. GPU tests run sequentially.

| Tier / view | Baseline FPS | Revised FPS | Revised p95 ms | Baseline → revised median triangles | Calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| High / captain 3000 | 40.2 | 40.4 | 33.4 | 2,144,087 → 2,144,100 | 889 |
| High / northern countryside | 57.3 | 56.5 | 33.3 | 571,119 → 571,133 | 319 |
| High / nearby moving | 51.8 | 54.8 | 33.3 | 2,501,924 → 2,449,368 | 394 |
| Low / captain 3000 | 60.0 | 60.0 | 16.7 | 789,093 → 789,102 | 524 |
| Low / northern countryside | 60.0 | 60.0 | 16.7 | 191,817 → 191,822 | 192 |
| Low / nearby moving | 60.0 | 60.0 | 16.8 | 316,930 → 316,939 | 257 |

The first high baseline was slower: **36.7 / 52.3 / 49.7 FPS**. Offline model
preparation overlapped part of that initial run. The table uses the clean high baseline
repeated immediately after the revised-version benchmark, with no model baking or
other test competing. Both baseline records remain, rather than claiming the first
sample's large apparent gain as an improvement. Low uses its initial display-capped
baseline. No performance result is a portable pass/fail threshold.

The foliage fix adds 24,000 triangles to each of two near-tree forms. Runtime still
targets 32 trees / 1.8M triangles, with a hard 48 / 2.4M including retirees. The moving
benchmark ends with **19 → 17** near trees. Fewer admitted models can reduce total
geometry in a particular view; the faster nearby sample is not a general optimization.
A separate 360-frame transition pass peaks at **30 trees / 2,396,266 triangles**, versus
34 / 2,387,696 before, and retains the same maximum fade increment (0.047619 per frame).
Jacaranda's slightly wider retained branches change a few terrain-projection triangles.
The distant tree shader, instance counts, draw batches and texture dimensions are unchanged.

The two GLBs grow by **1,184,520 bytes**. High colour/response images add **42,776**,
low **16,232**, and metadata adds one byte. Total prepared-transfer delta is therefore
**1,227,297 high / 16,233 low**. Measured menu startup stays **14,250,643 / 8,714,756**
bytes; complete prepared flight is **67,610,665 / 19,704,569**. Delivery tests confirm
no extra requests after flight start, no low-tier near-tree models, and unchanged
hidden-tab calibration / automatic low selection behavior. The larger models consume
additional decoded geometry memory; atlas allocation, samplers and render passes do not grow.

All 20 Node suites, source-coverage comparisons, actual placement/material checks,
near-tree transition budgets, both-tier canopy coverage, directional lighting including
missing/wrong-response fallbacks, and clear/dusk/overcast/night ground-shade checks pass.
Matched 480-frame pilot descents and 360-frame exterior passes are review recordings,
not benchmarks: capture/encoding affects their pacing. The review verifies image/video
loads and slider direction. Physical phones, other GPUs, SwiftShader and the full browser
functional suite were not rerun.

Evidence: `test/benchmarks/2026-10-26-canopy-*.json` and
[canopy review](output/canopy-review.html). To reproduce the source-quality comparison,
first fetch the ignored originals with `tools/fetch-authored-scenery.py`, then run:

```sh
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/flight-playwright VISUAL_GPU=metal \
CANOPY_BASELINE=/path/to/5967d47-archive node test/broadleaf-source.mjs
```

## Ridge farm and pond lane — 2026-10-27

Baseline `d2cf021`; Apple M2 Pro / Chromium 141 / ANGLE Metal, 1440 × 900,
high 1.5× / low 1×. Four-second warm-up, twelve-second samples; paused physics,
active rendering and scenery updates. Benchmark jobs run alone, without model baking
or other GPU tests. The baseline close camera was moved out of the trees and resampled
before comparison; the retained combined baseline uses that matched field-side view.

| Tier / scene | Before FPS | After FPS | After p95 ms | Median calls | Median triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain-6500 | 31.3 | 33.2 | 33.4 | 1187 → 1201 | 2,990,497 → 3,018,747 |
| high / ridge-farm-wide | 60.0 | 60.0 | 16.8 | 398 → 412 | 1,057,828 → 1,085,958 |
| high / ridge-farm-close | 46.4 | 45.4 | 33.4 | 722 → 732 | 2,777,727 → 3,077,851 |
| low / captain-6500 | 60.0 | 60.0 | 16.7 | 686 → 700 | 1,249,291 → 1,277,609 |
| low / ridge-farm-wide | 60.0 | 60.0 | 16.7 | 231 → 245 | 497,846 → 527,458 |
| low / ridge-farm-close | 60.0 | 60.0 | 16.7 | 484 → 498 | 762,723 → 792,335 |

The farm adds three complete buildings, 4,618 building triangles including 414 triangles
of terrain-fitted foundation/entrance geometry, 25,156 ground/fence triangles and 14
material batches. Near/far complete-building totals are 165,567 / 118,598; grounds
use 377,642 triangles, plus the existing 2,924-triangle yard. Foundation bases and
ramps reuse the concrete material batch and survive the far detail level.

High's close view selects 20 nearby trees versus 19 before, after the new parcels
change procedural planting exclusions. This changes the mix of near geometry and
accounts for much of the roughly 300K increase in total rendered triangles there.
The near pool's 1.8M target / 2.4M hard cap and total planting caps remain unchanged.
The pilot sample remains around 30–33 FPS at this fixed high resolution. Its higher
final result is run-to-run variation, not a measured optimization; adaptive resolution
remains necessary on this hardware. Low's display-capped 60 FPS does not certify phones.

Measured startup is **14,253,990 / 8,718,103 bytes** high / low, up 3,347 bytes of shared
code. Full prepared flight is **67,696,253 / 19,790,129 bytes**, up **85,588 / 85,560**.
Models and site data still prepare behind the menu; no new images or larger textures.
No requests occur during the short test flight. Automatic low selection, hidden-tab
calibration, missing GLB/material/site fallbacks and low-tier terrain registration pass.

All 20 Node suites pass. The actual browser checks cover both quality tiers, 89 roof
samples, three downhill base walls, four ramp joins, 57 local accesses, 26 main-road
joins, roof notches, planting clearances and terrain contact within 0.034 mm. The
shared atmospheric uniforms bind on all checked fogged materials (190 high / 171 low).
Two matched 480-frame pilot descents run without renderer errors; the recorded videos
are visual evidence, not benchmarks, because encoding changes their pacing. All 28
comparison images, both video metadata loads, slider direction and phone page layout pass.

Forward pilot visibility is very limited: changed pixels above a 12-level threshold
are 0.0029% at x=6500 and 0.0049% at x=6000. The new site is most apparent in the
exterior and yard views. The audit therefore moves the next focus to cockpit materials
and lighting, requiring an initial pilot-view check before further rural authoring.
The retained evidence does not certify other GPUs, SwiftShader or physical phones;
the full functional browser suite was not rerun.

Evidence: `benchmarks/2026-10-27-ridge-farm-*.json` and
[ridge farm comparison](output/ridge-farm-review.html).


## Cockpit contact shading and console finish — 2026-10-27

Baseline: main `13482b7`. Same Apple M2 Pro / Chromium ANGLE Metal method, 1440×900,
high 1.5× / low 1×, four-second warm-up and twelve-second samples; paused physics.
Runs were sequential with no competing graphics test or asset bake.

| Tier / scene | Baseline FPS (recheck) | Final FPS | Final p95 ms | Draw calls | Added drawn triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| High / captain | 37.3 (38.1) | 37.6 | 33.4 | 918 | 47,410 |
| High / storm | 39.9 (38.7) | 39.2 | 33.4 | 873 | 47,410 |
| Low / captain | 60.0 | 60.0 | 16.7 | 529 | 9,363 |
| Low / storm | 60.0 | 60.0 | 16.7 | 499 | 9,363 |

Refined contact shading adds 23,705 high / 9,363 low model triangles. High draws them
in the cabin shadow pass too. The console reuses the existing liner texture and adds no
texture download or render pass. A one-projection fast path for axis-aligned surfaces
avoids unnecessary texture samples on high; curved surfaces retain the original blend,
with explicit gradients for mip selection. Low does not use these grain maps or this path.

An initial denser mesh added 63,957 high / 25,965 low triangles and measured 35.3 / 37.0
FPS on high. Reducing it and adding the projection fast path produced the final result
above. Baseline rechecks bracket the final high readings, so report similar performance
within short-run variation, not a measured speedup. High remains below 60 FPS at this
render scale; adaptive resolution is still needed. Physical phone performance is unmeasured.

Reports: `benchmarks/2026-10-27-cabin-depth-before.json`, `-baseline-recheck.json`,
`-final-high.json` and `-final-low.json`. The high-only texture optimization was measured
separately; the low rows come from the unchanged low-tier run. The `-reduced-before-projection`
report records that intermediate mesh for transparency. Model downloads increase by
79,784 high / 51,572 low bytes, to 8,279,228 / 3,622,368 bytes respectively.


## Pedestal, overhead and upper-liner finishes — 2026-10-27

Baseline: main `437ed97`. Sequential Apple M2 Pro / Chromium ANGLE Metal runs,
1440×900, high 1.5× / low 1×, four-second warm-up and twelve-second samples, paused
physics. No competing graphics test or asset bake. The actual pilot eye is fixed;
the overhead and pedestal cases turn the normal head-look controls.

| Tier / view | Before FPS | After FPS | After p95 ms | Draw calls (unchanged) | Drawn triangles (unchanged) |
| --- | ---: | ---: | ---: | ---: | ---: |
| high / captain | 32.0 | 35.2 | 33.4 | 918 | 2,255,828 |
| high / cabin-overhead | 50.0 | 52.5 | 33.3 | 325 | 1,679,248 |
| high / cabin-pedestal | 42.1 | 44.8 | 33.4 | 416 | 2,101,464 |
| low / captain | 60.0 | 60.0 | 16.7 | 529 | 794,755 |
| low / cabin-overhead | 60.0 | 60.0 | 16.8 | 143 | 525,133 |
| low / cabin-pedestal | 60.0 | 60.0 | 16.7 | 224 | 654,143 |

No observed regression in these samples. The modest increases are within short-run
scheduling variation and are not evidence of an optimization. Fixed high-resolution
forward flight remains below 60 FPS; automatic resolution/quality management is still
needed. Display-capped low results do not measure physical-phone performance.

The packed atlas doubles in area to 2048×1024 / 1024×512, preserving old-slot texel
density. Files increase by 352,754 / 146,578 bytes to 662,114 / 279,710 bytes and still
load behind the menu. Assuming mipmapped RGBA8 storage, the atlas adds approximately
5.33 / 1.33 MiB. Additional finish-coordinate arrays use 476,352 / 339,756 bytes;
the fitted roof gains 2,652 bytes of high-tier grain coordinates. Driver allocation
can vary. The source GLBs and their triangle counts are unchanged.

The new regions reuse existing texture objects and six high-tier grain maps; low uses
none of those grain maps. More surfaces sample the shared packed atlas, and the roof
now shares the existing trim shader. There is no added light, render pass or draw call.
Connected curved parts are outlined as a whole offline, so normal changes do not
create false seams. A narrow liner join replaces the overly prominent prototype.

Evidence: `benchmarks/2026-10-27-cabin-textures-before.json`, `-after.json`, and
[matched cockpit review](output/cabin-textures-review.html). Its 360-frame head movement
clips show material attachment during motion, not frame-rate performance; video encoding
alters pacing. Fine source lettering still aliases, and low-tier lettering also loses
shape. No physical phone or additional GPU driver is certified by this pass.

Measured startup is 14,335,851 / 8,771,752 bytes high / low (1,470 new runtime bytes).
Prepared flight is 68,130,868 / 19,990,356 bytes, increases of 354,224 / 148,048.
Menu budgets, preparation completion, zero further asset requests during the short
flight, automatic low selection and hidden-tab calibration all pass. The 22 Node
suites, finite lighting/reflection/fallback checks and ten viewport layout cases pass.
Reports are retained alongside the benchmark under `2026-10-27-cabin-textures-*`.


## Cumulative review corrections — 2026-10-28

The historical anchor `9c135d2` precedes the hillside work. The immediate baseline is
`421bf9e`. All three builds use the current benchmark harness, matched camera/weather,
Apple M2 Pro / Chromium ANGLE Metal, 1440×900, high 1.5×, four-second warm-up and
twelve-second samples with paused physics. Runs are sequential, with no competing
capture, bake or graphics test. This comparison includes all intervening scenery and
cockpit changes; it does not isolate the cost of the 18,000 additional trees.

| High scene | Historical FPS | Published FPS | Corrected FPS | Corrected p95 ms | Draw calls: historical / published / corrected |
| --- | ---: | ---: | ---: | ---: | ---: |
| Captain | 37.8 | 33.2 | 34.7 | 33.4 | 918 / 918 / 918 |
| Upper approach (x=6500) | 33.9 | 29.5 | 30.1 | 33.4 | 1162 / 1201 / 1201 |
| Storm | 40.1 | 35.5 | 36.2 | 33.4 | 873 / 873 / 873 |

The published build is approximately 12–13% slower than the historical anchor in these
samples. Corrected results remain below the historical measurements, while showing no
observed regression against the immediate baseline. Small increases are within normal
short-run variation, not a proven speedup. The published upper sample had a 49.9 ms p95;
corrected p95 is 33.4 ms, which also requires longer runs before claiming an improvement.
Low at 1× measures around 60 FPS in all three views, p95 16.7–16.8 ms, on this Mac.

The corrections keep 70,000 / 14,000 trees. A shared high candidate grid and smoothed
allocation replace hard per-map count boundaries. Candidate generation, selection and
lossless map snapshots add preparation CPU/transient-memory work, not per-frame work;
peak memory and preparation-time deltas were not separately profiled. The selected tree
count, imagery dimensions, lights and render-pass count do not increase.

Edited full high and reduced low canvases no longer persist as texture sources. Their
17.62 / 4.94 MB backing stores are cleared after lossless PNG snapshots decode to images.
Decoded pixels and GPU texture memory still exist, and context re-upload can use the
images; this is a canvas-pool lifetime fix, not a claimed 17.62 MB total-memory saving.
CPU/GPU sample checks verify that the snapshot preserves coverage and orientation.

Startup is 14,337,800 / 8,773,701 bytes high / low (up 1,949). Low has 226,299 bytes left
under the 9 MB startup test budget. Prepared transfer is 68,139,100 / 19,995,504 bytes
(up 8,232 / 5,148). Land-cover data totals 454,251 bytes, including the airport mask.
The high-only planting module loads behind the menu; low does not download it.
Delivery budgets, preparation and automatic-low selection pass. Frame-rate tests alone
do not certify physical phones, other GPUs or driver compatibility.

Retained reports: `benchmarks/2026-10-28-review-corrections-benchmark-historical.json`,
`-benchmark-before.json`, `-benchmark-after.json`, `-delivery.json` and `-joins-*.json`.
[Matched review](output/woodland-joins-review.html) shows the visible correction and
per-edge densities. All 23 Node suites and targeted cockpit/lighting/land-cover checks
pass. The full functional browser suite was not rerun.


## Preparation responsiveness review — 2026-10-29

The previous cumulative FPS measurements remain the rendering baseline. This pass
changes scheduling during initial scenery preparation, not per-frame rendering.
`test/woodland-preparation.mjs` instruments the published `3c3b960` and working code,
disables 3D drawing and shader warm-up, and counts normal 8 ms timer callbacks during
photo sampling, planting and initial canopy shade construction. This is a main-thread
responsiveness probe, not a hardware FPS or end-to-end startup benchmark.

| Tier | Baseline elapsed / callbacks | Sliced elapsed / callbacks | Longest callback gap before / after | New maximum work slice |
| --- | ---: | ---: | ---: | ---: |
| High | 1477 ms / 0 | 2015 ms / 167 | 1477 / 465 ms | 240 ms |
| Low | 139 ms / 0 | 185 ms / 15 | 139 / 30 ms | 17 ms |

High had 121 yielding boundaries; low had 15. The JavaScript batches target 8 ms;
native canvas photo readback cannot be interrupted and remains the longest high-tier
slice. Serving the menu between batches deliberately adds elapsed time. This does not
claim faster loading or eliminate every loading stall. Initial shadow building yields;
later sun-direction rebuilds still run synchronously. The geometry hashes before/after
match: high `aa11f328`, low `115884f7`, covering every tree matrix/color and shadow
position/UV/index. Budgets, selected trees, shader work and render counts are unchanged.

The low 2048×603 land-cover PNG snapshot took 33 ms including decode in the same sample.
It remains asynchronous, once during preparation; its purpose is releasing the canvas
backing store while preserving re-upload pixels. No total-memory saving or phone timing
is inferred from this measurement. The high snapshot took 80 ms in this run, with wall
time varying when other preparation work competes. No new GPU benchmark is claimed.

Validation: all 24 Node suites; the full `npm run test:corridor` (including the eight
join profiles and missing-map fallback); canopy contribution, weather and sun-change
checks; delivery and automatic-low selection pass on Metal. The default SwiftShader
run was attempted but failed to create a WebGL context in this installed macOS browser
(`BindToCurrentSequence failed`). No successful software-renderer run, physical-phone
result, or full functional-suite run is claimed for this follow-up.

Startup transfer: 14,339,711 high / 8,775,612 low bytes (+1,911 each). Prepared transfer:
68,141,654 high / 19,997,415 low bytes (+2,554 / +1,911). Low retains 224,388 bytes of
its startup guard; no new asset is delivered. Evidence is retained under
`benchmarks/2026-10-29-preparation-*.json`. `test:woodland-preparation` is available
for the responsiveness probe; its default renderer is also SwiftShader.
