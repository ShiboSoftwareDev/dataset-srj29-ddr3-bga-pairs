# dataset-srj29-ddr3-bga-pairs

Twenty reproducible Simple Route JSON (SRJ) problems centered on one task: connect a DDR3 memory BGA to a neighboring controller/FPGA BGA. The boards are deliberately roomy. The benchmark tests paired-BGA topology and routing across enough copper layers, not placement compaction or an artificially tight outline.

## Dataset design

- Every sample contains exactly two top-side BGA pad fields: `ddr3_bga` and `controller_bga`.
- The DDR3 side uses a synthetic FBGA-96-style 0.8 mm-pitch package and a realistic DDR3 x8 or x16 signal set.
- The neighboring controller varies between 12×12, 14×14, and 16×16 BGAs at 0.8 or 1.0 mm pitch.
- DDR3 x8 samples contain 38 routed signals; DDR3 x16 samples contain 49.
- Boards use six or eight copper layers. The generator guarantees at least as many inner routing layers as the connected-ball column depth.
- Component edge-to-edge spacing varies from 5.2 mm to 8.4 mm, with an additional 4.8/5.2 mm board margin.
- Vias are 0.34 mm pad / 0.15 mm drill, dogbone-compatible at the selected pitches. `allowViaInPad` is false.
- DDR3 clock and DQS nets are identified as differential pairs. Data and address/command groups are identified as buses with generous skew limits.

The signal names and grouping are DDR3-realistic, but the synthetic benchmark ball map is not a drop-in pin map for a particular vendor part. Do not use these samples as manufacturing schematics.

## Why this structure

The repository follows the package/export conventions used by [`dataset-srj18`](https://github.com/tscircuit/dataset-srj18) and [`dataset-srj24`](https://github.com/tscircuit/dataset-srj24): numbered JSON samples, `index.js` exports, TypeScript declarations, a manifest, validation, and a local viewer.

The geometry and identifiers follow the BGA-specific conventions in [`dataset-srj16-bga-breakouts`](https://github.com/tscircuit/dataset-srj16-bga-breakouts), [`dataset-srj19`](https://github.com/tscircuit/dataset-srj19), and [`dataset-srj20`](https://github.com/tscircuit/dataset-srj20). In particular, every pad has a stable `componentId`, allowing the current tscircuit autorouter to detect both BGA grids. [`autorouting-dataset-01`](https://github.com/tscircuit/autorouting-dataset-01) was reviewed for its generated-circuit/SRJ validation conventions.

## Repository layout

- `samples/sampleNNN.json` — the 20 unrouted SRJ benchmark inputs.
- `manifest.json` — compact sample index and board statistics.
- `index.js`, `index.d.ts` — CommonJS package exports compatible with the benchmark fixture style.
- `scripts/generate.mjs` — deterministic generator and SVG preview renderer.
- `scripts/validate.mjs` — geometry, connectivity, clearance, layer-capacity, and package checks.
- `scripts/autoroute-smoke.mjs` — optional current-pipeline smoke benchmark.
- `validation-report.json` — checked metrics for every generated sample.
- `autorouter-smoke-report.json`, `AUTOROUTER_NOTES.md` — current Pipeline 7 compatibility evidence and limitations.
- `previews/` — one unrouted ratsnest SVG per sample plus a 20-sample contact sheet.
- `index.html`, `viewer.js`, `viewer.css` — zero-build local dataset browser.

## Usage

```js
const { sample001, dataset } = require("@tscircuit/dataset-srj29-ddr3-bga-pairs")
```

## Generate and validate

```sh
npm run generate
npm test
```

The validator rejects pad overlaps, pads outside the outline, missing or duplicated endpoints, too-small BGA channels, dogbone-via clearance failures, insufficient layers, narrow component gaps, or overly high per-layer connection burden.

## Preview

```sh
npm run preview
```

Then open `http://127.0.0.1:4173`.

## Optional autorouter smoke test

```sh
npm install
npm run autoroute:smoke
```

By default this runs a 100,000-step current-Pipeline-7 compatibility smoke test against four representative samples. A step-limit result is accepted as long as the solver does not fail; use `--require-solved` when a full solution is mandatory. Select other samples or budgets with:

```sh
node scripts/autoroute-smoke.mjs --samples=1,5,12,20 --max-steps=1500000 --require-solved
```

The result is written to `autorouter-smoke-report.json`. A solver failure is useful benchmark information; the static feasibility checks remain independent of any one autorouter implementation.

## Scope

These are routing benchmarks, not reference DDR3 layouts. They intentionally omit termination networks, decoupling, power/ground balls as electrical nets, stackup impedance, timing budgets, and manufacturing sign-off.
