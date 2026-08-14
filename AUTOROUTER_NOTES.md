# Current autorouter observations

The dataset was checked with `@tscircuit/capacity-autorouter` 0.0.803 and `AutoroutingPipelineSolver7_MultiGraph`.

The default 100,000-step smoke run covers `sample001`, `sample007`, `sample014`, and `sample020`, representing x8/x16 DDR3, 6/8-layer boards, different BGA sizes, both left/right placements, and different package gaps. All four:

- completed preprocessing and component detection without rejecting the SRJ;
- progressed through escape-via placement, endpoint pairing, and topology planning;
- reached `portPointPathingSolver`;
- reported no solver failure in the quick budget.

They were not fully routed within 100,000 steps. A longer exploratory run also remained in pathing and was stopped after more than 250 seconds without a solver failure. This is recorded as benchmark difficulty, not evidence that the layouts are impossible. The independent `validation-report.json` documents the geometric and conservative capacity checks for all 20 samples.

Run `npm run autoroute:smoke` to refresh the checked report. Add `--require-solved` and a larger `--max-steps` value when evaluating a full solve.
