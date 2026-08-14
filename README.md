# dataset-srj29-ddr3-bga-pairs

Twenty spacious multilayer Simple Route JSON fixtures that reproduce a real DDR3L interface ball-for-ball: the official BeagleBone Black D1 schematic connection between U12, a 4-Gbit x16 DDR3L device in a sparse 96-ball FBGA, and U5, the AM3358BZCZ100 in its ZCZ 324-ball NFBGA.

This revision does not invent a controller ballout. All 50 connections come from the board schematic and are stored as explicit `board net → U12 ball/pin → U5 ball/pin` records in [CONNECTION_MAP.md](CONNECTION_MAP.md) and [`reference/beaglebone-black-ddr3-map.json`](reference/beaglebone-black-ddr3-map.json).

Examples:

- `DDR_D0`: U12 E3 / DQ0 → U5 M3 / DDR_D0
- `DDR_D11`: U12 C2 / DQ11 → U5 K3 / DDR_D11
- `DDR_DQS0`: U12 F3 / LDQS → U5 P1 / DDR_DQS0
- `DDR_A15`: U12 M7 / A15 → U5 D3 / DDR_A15
- `DDR_CLK`: U12 J7 / CK → U5 D2 / DDR_CK
- `DDR_RESETn`: U12 T2 / RESET# → U5 J3 / DDR_RESET

## What each sample contains

- The real sparse 16-row × 9-column, 96-populated-ball DDR3L footprint at 0.8 mm pitch.
- The real 18 × 18, 324-ball AM3358 ZCZ footprint at 0.8 mm pitch.
- Exactly 50 direct interface nets: 16 DQ, two DQS pairs, two masks, 16 address, three bank, command, clock, and control signals.
- A 9.2–13.2 mm physical gap between pad fields so the benchmark tests paired-BGA fanout and routing, not artificial board compaction.
- 12 or 14 total copper layers, leaving 10 or 12 routing layers under the dataset's conservative capacity model.
- Either the documented top-view orientation or a legal 180° rotation of both packages; ball identities rotate with the footprints.
- No pre-routed traces and no via-in-pad.

The samples deliberately exclude power/ground routing, VREF generation, ZQ, decoupling, and external termination components. Those are real-board requirements but are not direct chip-to-chip connections, so their balls remain physical obstacles without being added as U12↔U5 nets.

## Sources

The endpoint map was checked against the official BeagleBone Black schematic, U5 on sheet 3 and U12 on sheet 7. The BeagleBoard hardware documentation describes the x16 DDR3L interface and the 96-ball, 0.8 mm memory package. Texas Instruments identifies AM3358BZCZ100 as the 324-ball ZCZ package.

- [Official BeagleBone Black hardware repository and schematic](https://github.com/beagleboard/beaglebone-black/blob/master/BBB-SCH.pdf)
- [Official BeagleBone Black hardware design documentation](https://docs.beagleboard.org/boards/beaglebone/black/ch06.html)
- [TI AM3358BZCZ100 product/package page](https://www.ti.com/product/AM3358/part-details/AM3358BZCZ100)

## Repository layout

- `reference/beaglebone-black-ddr3-map.json` — canonical real-board endpoint map and source provenance.
- `CONNECTION_MAP.md` — readable table of all 50 endpoint triples.
- `samples/sampleNNN.json` — 20 unrouted benchmark inputs.
- `manifest.json` — sample index, package statistics, placement, and layer budget.
- `scripts/generate.mjs` — deterministic sample and mapping-table generator.
- `scripts/validate.mjs` — package, endpoint-map, geometry, capacity, and snapshot validation.
- `snapshots/` — one PCB SVG per sample produced by `circuit-to-svg`.
- `previews/` — one colored ratsnest SVG per sample and a contact sheet.

## Generate and validate

```sh
npm run generate
npm test
```

The validator resolves every connection endpoint back to the physical package ball and compares its net, ball, and pin name against the canonical real-board map. It also rejects missing package balls, duplicate endpoints, pad overlaps, insufficient clearance, gaps below 9 mm, insufficient layer capacity, and snapshots that do not contain all 420 physical pads and 50 ratsnests.

## Package usage

```js
const { sample001, dataset } = require("@tscircuit/dataset-srj29-ddr3-bga-pairs")
```

The tscircuit autorouter repository contains a dedicated dataset fixture pipeline that runs component detection, fanout on both detected BGA packages, and then the multilayer autorouter.
