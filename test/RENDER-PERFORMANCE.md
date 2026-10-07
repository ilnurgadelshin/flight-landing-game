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
