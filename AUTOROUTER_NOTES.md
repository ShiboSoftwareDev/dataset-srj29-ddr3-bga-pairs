# Autorouter observations

The dataset's raw compatibility smoke test uses `@tscircuit/capacity-autorouter` 0.0.803 and `AutoroutingPipelineSolver7_MultiGraph`. The default 100,000-step run covers `sample001`, `sample007`, `sample014`, and `sample020`, spanning 0°/180° orientations, 10–13.2 mm package gaps, and 12-layer boards. Each input has the same real 50-net BeagleBone Black endpoint map, 96 DDR3L balls, and 324 AM3358 balls.

All four inputs completed preprocessing without a solver failure and reached the pathing stage. They did not fully route inside the short 100,000-step budget; that result is recorded in `autorouter-smoke-report.json` and is not treated as proof of completion.

The intended benchmark fixture is in the tscircuit autorouter repository. Its dedicated pipeline runs component detection, invokes the standalone fanout solver on both detected BGAs, and then runs the multilayer Pipeline 7 autorouter. Static feasibility and exact endpoint correctness are checked independently by `validation-report.json`.

Run `npm run autoroute:smoke` to refresh the raw Pipeline 7 report. Use the autorouter fixture for the actual detection → DDR3 fanout → AM3358 fanout → autoroute workflow.
