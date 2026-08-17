# Autorouter observations

Samples 001–020 are intentionally roomy paired-BGA routing problems. They vary in real endpoint mapping, memory width, BGA population, controller pitch, connected-pad depth, and layer count—not merely placement. Sample 021 is intentionally different: it is the exact 8-layer, 33-signal AM62L32/LPDDR4 published reproduction and should not be widened or thinned to match the synthetic fixture envelope.

The raw compatibility smoke test uses `@tscircuit/capacity-autorouter` and `AutoroutingPipelineSolver7_MultiGraph`. Its representative set should include small/medium/large controller packages and 0.5/0.65/0.8/1.0 mm controller pitch classes. A short step-limited smoke run proves input compatibility, not complete DDR3 routing.

The intended benchmark fixture lives in the tscircuit autorouter repository. Its dedicated Pipeline 10 runs component detection, invokes the standalone fanout solver once per detected BGA, and then runs the multilayer Pipeline 9 autorouter. The first twenty samples route balanced 16-net subsets; sample 021 carries all 33 published DDR signals. `validation-report.json` independently checks source endpoints and package geometry, applies the roomy feasibility envelope only to samples 001–020, and checks sample 021 against its exact published board constraints.

Run `npm run autoroute:smoke` to refresh the raw compatibility report. Use the autorouter fixture for the actual detection → fanout both BGAs → autoroute workflow.
