# Autorouter observations

These 20 inputs are intentionally roomy paired-BGA routing problems. They vary in real endpoint mapping, memory width, BGA population, controller pitch, connected-pad depth, and layer count—not merely placement.

The raw compatibility smoke test uses `@tscircuit/capacity-autorouter` and `AutoroutingPipelineSolver7_MultiGraph`. Its representative set should include small/medium/large controller packages and 0.5/0.65/0.8/1.0 mm controller pitch classes. A short step-limited smoke run proves input compatibility, not complete DDR3 routing.

The intended benchmark fixture lives in the tscircuit autorouter repository. Its dedicated Pipeline 10 runs component detection, invokes the standalone fanout solver once per detected BGA, and then runs the multilayer Pipeline 9 autorouter. Each sample routes a balanced 16-net subset from its complete reference map so the fixture measures the two-BGA connection pipeline rather than an artificially dense full-memory-bus board. `validation-report.json` independently checks exact source endpoints, package geometry, clearance, corridor width, and layer budget.

Run `npm run autoroute:smoke` to refresh the raw compatibility report. Use the autorouter fixture for the actual detection → fanout both BGAs → autoroute workflow.
