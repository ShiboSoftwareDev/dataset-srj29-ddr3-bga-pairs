import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const samplesDir = path.join(repoRoot, "samples")
const require = createRequire(import.meta.url)
const exportedDataset = require(path.join(repoRoot, "index.js"))
const EPSILON = 1e-7

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const round = (value, precision = 4) => Number(value.toFixed(precision))
const containsPoint = (obstacle, point) =>
  Math.abs(obstacle.center.x - point.x) <= EPSILON && Math.abs(obstacle.center.y - point.y) <= EPSILON
const boxesOverlap = (a, b) =>
  Math.abs(a.center.x - b.center.x) * 2 < a.width + b.width - EPSILON &&
  Math.abs(a.center.y - b.center.y) * 2 < a.height + b.height - EPSILON

const sampleFiles = (await readdir(samplesDir)).filter((file) => /^sample\d{3}\.json$/.test(file)).sort()
assert(sampleFiles.length === 20, `Expected 20 samples, found ${sampleFiles.length}`)

const report = {
  datasetName: "dataset-srj29-ddr3-bga-pairs",
  validatedAt: new Date().toISOString(),
  checks: [
    "20 sequential package exports",
    "exactly two non-overlapping top-side BGA pad fields",
    "every DDR3 net has one endpoint on each BGA",
    "all pads fully inside the board outline",
    "minimum trace channel and dogbone-via geometry",
    "at least 5 mm between the two BGA pad-field edges",
    "conservative multilayer escape and corridor capacity",
    "DDR3 signal groups and differential-pair references",
  ],
  samples: [],
}

for (const [index, file] of sampleFiles.entries()) {
  const expectedId = `sample${String(index + 1).padStart(3, "0")}`
  const sample = JSON.parse(await readFile(path.join(samplesDir, file), "utf8"))
  assert(sample.id === expectedId, `${file}: expected id ${expectedId}, found ${sample.id}`)
  assert(exportedDataset[expectedId], `${file}: missing package export ${expectedId}`)
  assert(exportedDataset.dataset?.[expectedId], `${file}: missing dataset.${expectedId}`)
  assert(!sample.traces || sample.traces.length === 0, `${file}: benchmark input must be unrouted`)
  assert(sample.allowViaInPad === false, `${file}: via-in-pad must remain disabled`)
  assert([6, 8].includes(sample.layerCount), `${file}: expected 6 or 8 layers, found ${sample.layerCount}`)

  const ddr3Pads = sample.obstacles.filter((obstacle) => obstacle.componentId === "ddr3_bga")
  const controllerPads = sample.obstacles.filter((obstacle) => obstacle.componentId === "controller_bga")
  assert(ddr3Pads.length === 96, `${file}: expected 96 DDR3 pads, found ${ddr3Pads.length}`)
  assert(controllerPads.length >= 144, `${file}: controller BGA is too small`)
  assert(ddr3Pads.length + controllerPads.length === sample.obstacles.length, `${file}: unexpected non-BGA obstacles`)
  assert(sample.connections.length === (sample.metadata.ddr3.dataWidth === 8 ? 38 : 49), `${file}: unexpected DDR3 signal count`)

  for (const obstacle of sample.obstacles) {
    assert(obstacle.type === "rect", `${file}: non-rect obstacle ${obstacle.obstacleId}`)
    assert(obstacle.layers.length === 1 && obstacle.layers[0] === "top", `${file}: BGA pad must be on top`)
    assert(obstacle.width > 0 && obstacle.height > 0, `${file}: invalid pad size`)
    assert(obstacle.center.x - obstacle.width / 2 >= sample.bounds.minX - EPSILON, `${file}: ${obstacle.obstacleId} exceeds minX`)
    assert(obstacle.center.x + obstacle.width / 2 <= sample.bounds.maxX + EPSILON, `${file}: ${obstacle.obstacleId} exceeds maxX`)
    assert(obstacle.center.y - obstacle.height / 2 >= sample.bounds.minY - EPSILON, `${file}: ${obstacle.obstacleId} exceeds minY`)
    assert(obstacle.center.y + obstacle.height / 2 <= sample.bounds.maxY + EPSILON, `${file}: ${obstacle.obstacleId} exceeds maxY`)
  }

  for (let a = 0; a < sample.obstacles.length - 1; a++) {
    for (let b = a + 1; b < sample.obstacles.length; b++) {
      assert(!boxesOverlap(sample.obstacles[a], sample.obstacles[b]), `${file}: overlapping pads ${sample.obstacles[a].obstacleId} and ${sample.obstacles[b].obstacleId}`)
    }
  }

  const connectionNames = new Set(sample.connections.map((connection) => connection.name))
  assert(connectionNames.size === sample.connections.length, `${file}: duplicate connection names`)
  for (const connection of sample.connections) {
    assert(connection.pointsToConnect.length === 2, `${file}: ${connection.name} must have exactly two endpoints`)
    const endpointComponents = []
    for (const point of connection.pointsToConnect) {
      assert(point.layer === "top", `${file}: ${connection.name} endpoint is not on top`)
      const endpointPads = sample.obstacles.filter(
        (obstacle) => containsPoint(obstacle, point) && obstacle.connectedTo.includes(connection.name),
      )
      assert(endpointPads.length === 1, `${file}: ${connection.name} endpoint resolves to ${endpointPads.length} pads`)
      endpointComponents.push(endpointPads[0].componentId)
    }
    assert(new Set(endpointComponents).size === 2, `${file}: ${connection.name} does not bridge the two BGAs`)
    assert(endpointComponents.includes("ddr3_bga"), `${file}: ${connection.name} has no DDR3 endpoint`)
    assert(endpointComponents.includes("controller_bga"), `${file}: ${connection.name} has no controller endpoint`)
  }

  for (const pair of sample.differentialPairs ?? []) {
    assert(pair.connectionNames.length === 2, `${file}: malformed differential pair`)
    assert(pair.connectionNames.every((name) => connectionNames.has(name)), `${file}: differential pair references a missing net`)
  }
  for (const bus of sample.buses ?? []) {
    assert(bus.connectionNames.length > 0, `${file}: empty bus ${bus.busId}`)
    assert(bus.connectionNames.every((name) => connectionNames.has(name)), `${file}: bus ${bus.busId} references a missing net`)
  }

  const ddr3Pitch = sample.metadata.ddr3.pitch
  const controllerPitch = sample.metadata.controller.pitch
  const ddr3PadSize = ddr3Pads[0].width
  const controllerPadSize = controllerPads[0].width
  const traceChannelNeed = sample.minTraceWidth + 2 * sample.minTraceToPadEdgeClearance
  const ddr3TraceChannel = ddr3Pitch - ddr3PadSize
  const controllerTraceChannel = controllerPitch - controllerPadSize
  assert(ddr3TraceChannel + EPSILON >= traceChannelNeed, `${file}: DDR3 trace channel is too narrow`)
  assert(controllerTraceChannel + EPSILON >= traceChannelNeed, `${file}: controller trace channel is too narrow`)

  const dogboneClearance = (pitch, padSize) =>
    pitch / Math.sqrt(2) - padSize / 2 - sample.minViaPadDiameter / 2
  const ddr3DogboneClearance = dogboneClearance(ddr3Pitch, ddr3PadSize)
  const controllerDogboneClearance = dogboneClearance(controllerPitch, controllerPadSize)
  assert(ddr3DogboneClearance + EPSILON >= sample.minViaEdgeToPadEdgeClearance, `${file}: DDR3 dogbone via cannot fit`)
  assert(controllerDogboneClearance + EPSILON >= sample.minViaEdgeToPadEdgeClearance, `${file}: controller dogbone via cannot fit`)

  const componentBounds = (pads) => ({
    minX: Math.min(...pads.map((pad) => pad.center.x - pad.width / 2)),
    maxX: Math.max(...pads.map((pad) => pad.center.x + pad.width / 2)),
  })
  const ddr3Bounds = componentBounds(ddr3Pads)
  const controllerBounds = componentBounds(controllerPads)
  const measuredGap = ddr3Bounds.maxX < controllerBounds.minX
    ? controllerBounds.minX - ddr3Bounds.maxX
    : ddr3Bounds.minX - controllerBounds.maxX
  assert(measuredGap >= 5 - EPSILON, `${file}: BGA-to-BGA gap ${measuredGap} mm is too tight`)

  const availableRoutingLayers = sample.layerCount - 2
  const maximumEscapeDepth = Math.max(
    sample.metadata.feasibility.connectedDdr3ColumnDepth,
    sample.metadata.feasibility.connectedControllerColumnDepth,
  )
  const connectionsPerInnerLayer = sample.connections.length / availableRoutingLayers
  assert(availableRoutingLayers >= maximumEscapeDepth, `${file}: insufficient inner layers for BGA escape depth`)
  assert(connectionsPerInnerLayer <= 10, `${file}: conservative inner-layer burden exceeded`)

  const boardWidth = sample.bounds.maxX - sample.bounds.minX
  const boardHeight = sample.bounds.maxY - sample.bounds.minY
  const copperObstacleArea = sample.obstacles.reduce((area, obstacle) => area + obstacle.width * obstacle.height, 0)
  const padAreaDensity = copperObstacleArea / (boardWidth * boardHeight)
  assert(padAreaDensity < 0.12, `${file}: pad density ${padAreaDensity} is unexpectedly high`)

  report.samples.push({
    id: sample.id,
    layerCount: sample.layerCount,
    connectionCount: sample.connections.length,
    obstacleCount: sample.obstacles.length,
    componentGap: round(measuredGap),
    ddr3TraceChannel: round(ddr3TraceChannel),
    controllerTraceChannel: round(controllerTraceChannel),
    ddr3DogboneClearance: round(ddr3DogboneClearance),
    controllerDogboneClearance: round(controllerDogboneClearance),
    connectionsPerInnerLayer: round(connectionsPerInnerLayer),
    padAreaDensity: round(padAreaDensity),
    status: "pass",
  })
}

await writeFile(path.join(repoRoot, "validation-report.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(`Validated ${report.samples.length} spacious multilayer DDR3-to-BGA samples`)
