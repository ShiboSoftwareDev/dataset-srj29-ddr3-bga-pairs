import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { AutoroutingPipelineSolver7_MultiGraph } from "@tscircuit/capacity-autorouter"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const requested = process.argv.find((arg) => arg.startsWith("--samples="))?.split("=")[1]
const maxSteps = Number(process.argv.find((arg) => arg.startsWith("--max-steps="))?.split("=")[1] ?? 100_000)
const requireSolved = process.argv.includes("--require-solved")
const sampleIds = requested
  ? requested.split(",").map((value) => `sample${String(Number(value)).padStart(3, "0")}`)
  : ["sample001", "sample007", "sample014", "sample020"]
const results = []

for (const id of sampleIds) {
  const srj = JSON.parse(await readFile(path.join(repoRoot, "samples", `${id}.json`), "utf8"))
  const startedAt = Date.now()
  let solver
  let steps = 0
  let thrownError
  try {
    solver = new AutoroutingPipelineSolver7_MultiGraph(srj, { effort: 1 })
    while (!solver.solved && !solver.failed && steps < maxSteps) {
      solver.step()
      steps++
    }
  } catch (error) {
    thrownError = error instanceof Error ? error.message : String(error)
  }
  let output
  if (solver?.solved) {
    try {
      output = solver.getOutputSimpleRouteJson?.()
    } catch (error) {
      thrownError = error instanceof Error ? error.message : String(error)
    }
  }
  results.push({
    id,
    solved: solver?.solved ?? false,
    failed: solver?.failed ?? Boolean(thrownError),
    timedOutByStepLimit: Boolean(solver && !solver.solved && !solver.failed),
    steps,
    elapsedMs: Date.now() - startedAt,
    expectedConnections: srj.connections.length,
    routedTraces: output?.traces?.length ?? 0,
    activePhase: solver?.getCurrentPhase?.(),
    activeStage: solver?.activeSubSolver?.constructor?.name,
    activeStageIterations: solver?.activeSubSolver?.iterations,
    activeStageMaxIterations: solver?.activeSubSolver?.MAX_ITERATIONS,
    error: thrownError ?? (solver?.error ? String(solver.error) : undefined),
  })
  console.log(`${id}: ${solver?.solved ? "solved" : solver?.failed || thrownError ? "failed" : "step limit"} in ${steps} steps${thrownError ? ` (${thrownError})` : ""}`)
}

const report = {
  solver: "AutoroutingPipelineSolver7_MultiGraph",
  packageVersion: "^0.0.803",
  createdAt: new Date().toISOString(),
  maxSteps,
  requireSolved,
  results,
}
await writeFile(path.join(repoRoot, "autorouter-smoke-report.json"), `${JSON.stringify(report, null, 2)}\n`)

if (results.some((result) => result.failed) || (requireSolved && results.some((result) => !result.solved))) process.exitCode = 1
