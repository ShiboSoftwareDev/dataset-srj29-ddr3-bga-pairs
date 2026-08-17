# dataset-srj29-ddr3-bga-pairs

Twenty-one memory-to-BGA Simple Route JSON fixtures: twenty spacious benchmarks derived from different real DDR3 boards, plus an exact flat-SRJ reproduction of the published [AM62L32 ↔ LPDDR4 automatic-breakout board](https://tscircuit.com/0hmX/am62l-lpddr4-breakout-repro). Samples 001–020 contain a 78- or 96-ball DDR3/DDR3L device, one real BGA FPGA/SoC/controller footprint, and a balanced 16-net subset selected only from that board's exact connections. Sample 021 preserves all 33 connections and all 573 balls from the published 8-layer AM62L32/MT53E1G16D1ZW design.

This revision intentionally does **not** reuse one connection map with different placement geometry. The source repositories, committed PCB/schematic files, endpoint maps, part numbers, BGA pad populations, and canonical endpoint hashes are listed in [CONNECTION_MAPS.md](CONNECTION_MAPS.md). The validator rejects a repeated repository, board, or endpoint hash.

## Dataset scope

- 20 different primary DDR3 board repositories pinned to exact commits, plus `@tsci/0hmX.am62l-lpddr4-breakout-repro@1.0.5`.
- 984 audited source memory↔BGA endpoint pairs; 353 routed endpoint pairs.
- Each routed subset represents data, strobe, mask, address, bank, command, clock, and control signals where present; source maps remain complete.
- Real 78-ball x8 or 96-ball x16 DDR3 package pad populations at approximately 0.8 mm pitch.
- Real 256- to 900-ball paired BGA footprints at 0.5–1.0 mm pitch.
- Exact board-net, DDR3 ball, and controller ball triples from committed KiCad PCB data, plus the audited official BeagleBone Black schematic map.
- A single series resistor is collapsed when it lies directly between the two chips; its reference/value and both board-net names remain in `sourcePath`.
- Samples 001–020 retain 12–18 mm clear pad-field corridors and 18–22 total layers selected from connected-pad depth and connection count.
- Sample 021 exactly retains the published 45×25 mm board, 8 layers, component centers and rotations, routing rules, three buses, three differential pairs, and 33 direct endpoint pairs.
- No pre-routed traces, no via-in-pad, and no artificial board compaction.
- One `circuit-to-svg` SVG snapshot per sample.

Power, ground, VREF, ZQ, decoupling, and termination-only branches are excluded because this benchmark is specifically the two-BGA signal-routing problem. Their package balls still exist as physical pad obstacles.

## Reference integrity

Each `reference/sampleNNN-*.json` file records:

- the board repository, exact source commit/path/URL, part references, and footprint names;
- every physical pad in both source BGA footprints, including land geometry and pitch;
- every included board net and its DDR3/controller balls and signals;
- any collapsed single-series-resistor path; and
- a SHA-256 hash of the canonical `DDR3 ball → controller ball` map.

The set spans Allwinner H3/H616, AM335x, i.MX6/i.MX7, STM32MP1, HPMicro, Zynq, Spartan-6, Artix-7, Kintex-7, ECP5, and the published AM62L32/LPDDR4 reproduction. See [CONNECTION_MAPS.md](CONNECTION_MAPS.md) for all 21 primary links.

## Repository layout

- `reference/reference-manifest.json` — ordered sample-to-source index and unique endpoint hashes.
- `reference/sampleNNN-*.json` — one complete, machine-readable source map per sample.
- `CONNECTION_MAPS.md` — readable table of all board references.
- `samples/sampleNNN.json` — 21 unrouted benchmark inputs.
- `manifest.json` — sample index, source, package, placement, and layer statistics.
- `scripts/generate.mjs` — deterministic dataset generator.
- `scripts/validate.mjs` — source-map, uniqueness, footprint, geometry, clearance, layer, and snapshot checks.
- `snapshots/` — one PCB SVG per sample produced by `circuit-to-svg`.
- `previews/` — colored ratsnest previews and a contact sheet.

## Generate and validate

```sh
npm run build
```

The validator resolves every selected routing endpoint back to its full source map and package ball. For samples 001–020 it rejects invented mappings, altered land geometry, overlaps, corridors below 12 mm, and insufficient routing clearance/layers. For sample 021 it checks the published package version and Circuit JSON hash, exact 573-pad geometry, 45×25 mm bounds, 8-layer stack, design rules, 33 endpoint pairs, buses, differential pairs, and circuit-to-svg snapshot without replacing the source reproduction with the roomier DDR3 constraints.

## Package usage

```js
const { sample001, dataset } = require("@tscircuit/dataset-srj29-ddr3-bga-pairs")
```

The tscircuit autorouter repository has a dedicated fixture pipeline that runs component detection, standalone fanout on both detected BGAs, and then the multilayer autorouter.
