import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const samplesDir = path.join(repoRoot, "samples")
const previewsDir = path.join(repoRoot, "previews")

const SAMPLE_COUNT = 20
const DDR3_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P"]
const CONTROLLER_ROWS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "J", "K",
  "L", "M", "N", "P", "R", "T", "U", "V", "W", "Y",
]
const GROUP_COLORS = {
  data: "#4ecdc4",
  strobe: "#ff6b6b",
  mask: "#ffd166",
  address: "#5f9df7",
  bank: "#9b7ede",
  command: "#f28e2b",
  clock: "#e15759",
  control: "#76b7b2",
}

const round = (value, precision = 4) => Number(value.toFixed(precision))
const sampleName = (index) => `sample${String(index).padStart(3, "0")}`
const safeId = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

function createRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function shuffle(items, rng) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function getSignals(dataWidth) {
  const signals = []
  for (let bit = 0; bit < dataWidth; bit++) signals.push({ name: `DDR3_DQ${bit}`, group: "data" })
  for (let byte = 0; byte < dataWidth / 8; byte++) {
    signals.push({ name: `DDR3_DQS${byte}_P`, group: "strobe" })
    signals.push({ name: `DDR3_DQS${byte}_N`, group: "strobe" })
    signals.push({ name: `DDR3_DM${byte}`, group: "mask" })
  }
  for (let address = 0; address <= 14; address++) signals.push({ name: `DDR3_A${address}`, group: "address" })
  for (let bank = 0; bank <= 2; bank++) signals.push({ name: `DDR3_BA${bank}`, group: "bank" })
  for (const name of ["DDR3_RAS_N", "DDR3_CAS_N", "DDR3_WE_N"]) signals.push({ name, group: "command" })
  signals.push({ name: "DDR3_CK_P", group: "clock" })
  signals.push({ name: "DDR3_CK_N", group: "clock" })
  for (const name of ["DDR3_CKE", "DDR3_CS_N", "DDR3_ODT", "DDR3_RESET_N"]) signals.push({ name, group: "control" })
  return signals
}

function makeGrid({ rows, cols, pitch, padSize, centerX, centerY, componentId, side, keep }) {
  const xOffset = ((cols - 1) * pitch) / 2
  const yOffset = ((rows.length - 1) * pitch) / 2
  const pads = []

  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < cols; col++) {
      if (keep && !keep(row, col)) continue
      const x = round(centerX + col * pitch - xOffset)
      const y = round(centerY + yOffset - row * pitch)
      pads.push({
        row,
        col,
        ball: `${rows[row]}${col + 1}`,
        x,
        y,
        width: padSize,
        height: padSize,
        pitch,
        componentId,
        side,
      })
    }
  }
  return pads
}

const isDdr3BallPresent = (row, col) => {
  if (col <= 2 || col >= 6) return true
  return [0, 1, 6, 7].includes(row)
}

function facingCandidates(pads, side, maxDepth, rng) {
  const columns = [...new Set(pads.map((pad) => pad.col))].sort((a, b) => a - b)
  const facingColumns = side === "left" ? columns.slice(-maxDepth).reverse() : columns.slice(0, maxDepth)
  const selected = pads.filter((pad) => facingColumns.includes(pad.col))
  const rowBuckets = new Map()
  for (const pad of selected) {
    if (!rowBuckets.has(pad.row)) rowBuckets.set(pad.row, [])
    rowBuckets.get(pad.row).push(pad)
  }

  const ordered = []
  for (const row of [...rowBuckets.keys()].sort((a, b) => a - b)) {
    const rowPads = rowBuckets.get(row).sort((a, b) => {
      return side === "left" ? b.col - a.col : a.col - b.col
    })
    ordered.push(...(rng() > 0.62 ? shuffle(rowPads, rng) : rowPads))
  }
  return ordered
}

function assignSignalsToPads(signals, pads, side, rng, maxDepth) {
  const candidates = facingCandidates(pads, side, maxDepth, rng)
  if (candidates.length < signals.length) {
    throw new Error(`Only ${candidates.length} facing pads are available for ${signals.length} signals`)
  }

  const candidateBands = []
  const bandSize = Math.ceil(candidates.length / 4)
  for (let start = 0; start < candidates.length; start += bandSize) {
    candidateBands.push(candidates.slice(start, start + bandSize))
  }
  const orderedCandidates = candidateBands.flatMap((band, index) =>
    index % 2 === 0 ? band : [...band].reverse(),
  )

  return new Map(signals.map((signal, index) => [orderedCandidates[index].ball, signal]))
}

function createObstacle(pad, signal) {
  const componentPrefix = pad.componentId === "ddr3_bga" ? "ddr3" : "controller"
  const padId = `${componentPrefix}_${safeId(pad.ball)}`
  const connectedTo = signal
    ? [signal.name, `pcb_port_${componentPrefix}_${safeId(signal.name)}`]
    : [`unconnected_${padId}`]

  return {
    obstacleId: `pcb_smtpad_${padId}`,
    componentId: pad.componentId,
    type: "rect",
    layers: ["top"],
    center: { x: pad.x, y: pad.y },
    width: pad.width,
    height: pad.height,
    connectedTo,
    circuitJsonMetadata: {
      source_component_name: pad.componentId === "ddr3_bga" ? "U_DDR3" : "U_CONTROLLER",
      source_port_name: signal?.name ?? `NC_${pad.ball}`,
    },
  }
}

function makeBuses(signals) {
  const names = (group) => signals.filter((signal) => signal.group === group).map((signal) => signal.name)
  return [
    { busId: "ddr3_data_bus", connectionNames: names("data"), maxLengthSkew: 1.5, traceWidth: 0.12 },
    {
      busId: "ddr3_address_command_bus",
      connectionNames: ["address", "bank", "command", "control"].flatMap(names),
      maxLengthSkew: 2.5,
      traceWidth: 0.12,
    },
  ]
}

function makeDifferentialPairs(signals, dataWidth) {
  const names = new Set(signals.map((signal) => signal.name))
  const pairs = [
    {
      connectionNames: ["DDR3_CK_P", "DDR3_CK_N"],
      lengthTolerance: 0.8,
      traceGap: 0.18,
      maxUncoupledLength: 5,
    },
  ]
  for (let byte = 0; byte < dataWidth / 8; byte++) {
    const pair = [`DDR3_DQS${byte}_P`, `DDR3_DQS${byte}_N`]
    if (pair.every((name) => names.has(name))) {
      pairs.push({ connectionNames: pair, lengthTolerance: 0.8, traceGap: 0.18, maxUncoupledLength: 5 })
    }
  }
  return pairs
}

function createSample(index) {
  const rng = createRng(0x3dd30000 + index * 7919)
  const dataWidth = index % 3 === 1 ? 8 : 16
  const signals = getSignals(dataWidth)
  const ddr3OnLeft = index % 4 !== 0
  const ddr3Side = ddr3OnLeft ? "left" : "right"
  const controllerSide = ddr3OnLeft ? "right" : "left"
  const controllerGridSize = [12, 14, 16, 14, 12][(index - 1) % 5]
  const controllerPitch = index % 5 === 0 ? 1 : 0.8
  const ddr3Pitch = 0.8
  const ddr3PadSize = 0.38
  const controllerPadSize = controllerPitch === 1 ? 0.5 : 0.42
  const ddr3Width = (9 - 1) * ddr3Pitch
  const ddr3Height = (DDR3_ROWS.length - 1) * ddr3Pitch
  const controllerWidth = (controllerGridSize - 1) * controllerPitch
  const controllerHeight = controllerWidth
  const componentGap = round(5.2 + ((index * 7) % 5) * 0.8)
  const verticalOffset = round(((index % 5) - 2) * 0.35)
  const ddr3XAbs = componentGap / 2 + ddr3Width / 2 + ddr3PadSize / 2
  const controllerXAbs = componentGap / 2 + controllerWidth / 2 + controllerPadSize / 2
  const ddr3CenterX = round(ddr3OnLeft ? -ddr3XAbs : ddr3XAbs)
  const controllerCenterX = round(ddr3OnLeft ? controllerXAbs : -controllerXAbs)
  const ddr3CenterY = verticalOffset
  const controllerCenterY = -verticalOffset
  const layerCount = dataWidth === 16 ? 8 : index % 5 === 1 ? 8 : 6

  const ddr3Pads = makeGrid({
    rows: DDR3_ROWS,
    cols: 9,
    pitch: ddr3Pitch,
    padSize: ddr3PadSize,
    centerX: ddr3CenterX,
    centerY: ddr3CenterY,
    componentId: "ddr3_bga",
    side: ddr3Side,
    keep: isDdr3BallPresent,
  })
  const controllerRows = CONTROLLER_ROWS.slice(0, controllerGridSize)
  const controllerPads = makeGrid({
    rows: controllerRows,
    cols: controllerGridSize,
    pitch: controllerPitch,
    padSize: controllerPadSize,
    centerX: controllerCenterX,
    centerY: controllerCenterY,
    componentId: "controller_bga",
    side: controllerSide,
  })

  const ddr3ColumnDepth = dataWidth === 16 ? 5 : 4
  const ddr3Assignments = assignSignalsToPads(signals, ddr3Pads, ddr3Side, rng, ddr3ColumnDepth)
  const controllerColumnDepth = dataWidth === 16 && controllerGridSize === 12 ? 5 : 4
  const controllerAssignments = assignSignalsToPads(signals, controllerPads, controllerSide, rng, controllerColumnDepth)
  const ddr3PadBySignal = new Map([...ddr3Assignments].map(([ball, signal]) => [signal.name, ddr3Pads.find((pad) => pad.ball === ball)]))
  const controllerPadBySignal = new Map([...controllerAssignments].map(([ball, signal]) => [signal.name, controllerPads.find((pad) => pad.ball === ball)]))

  const obstacles = [
    ...ddr3Pads.map((pad) => createObstacle(pad, ddr3Assignments.get(pad.ball))),
    ...controllerPads.map((pad) => createObstacle(pad, controllerAssignments.get(pad.ball))),
  ]
  const connections = signals.map((signal) => {
    const ddr3Pad = ddr3PadBySignal.get(signal.name)
    const controllerPad = controllerPadBySignal.get(signal.name)
    return {
      name: signal.name,
      rootConnectionName: signal.name,
      netConnectionName: signal.name,
      nominalTraceWidth: 0.12,
      pointsToConnect: [
        {
          x: ddr3Pad.x,
          y: ddr3Pad.y,
          layer: "top",
          pointId: `point_ddr3_${safeId(signal.name)}`,
          pcb_port_id: `pcb_port_ddr3_${safeId(signal.name)}`,
        },
        {
          x: controllerPad.x,
          y: controllerPad.y,
          layer: "top",
          pointId: `point_controller_${safeId(signal.name)}`,
          pcb_port_id: `pcb_port_controller_${safeId(signal.name)}`,
        },
      ],
    }
  })

  const minX = Math.min(...obstacles.map((obstacle) => obstacle.center.x - obstacle.width / 2)) - 4.8
  const maxX = Math.max(...obstacles.map((obstacle) => obstacle.center.x + obstacle.width / 2)) + 4.8
  const minY = Math.min(...obstacles.map((obstacle) => obstacle.center.y - obstacle.height / 2)) - 5.2
  const maxY = Math.max(...obstacles.map((obstacle) => obstacle.center.y + obstacle.height / 2)) + 5.2
  const bounds = { minX: round(minX), maxX: round(maxX), minY: round(minY), maxY: round(maxY) }
  const outline = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ]
  const groupCounts = Object.fromEntries(
    Object.keys(GROUP_COLORS).map((group) => [group, signals.filter((signal) => signal.group === group).length]),
  )

  return {
    id: sampleName(index),
    title: `DDR3 x${dataWidth} to ${controllerGridSize}x${controllerGridSize} controller BGA`,
    description: "A deliberately spacious DDR3-memory-to-controller BGA routing problem; the benchmark is paired-BGA connectivity, not board compaction.",
    layerCount,
    minTraceWidth: 0.12,
    nominalTraceWidth: 0.12,
    minViaHoleDiameter: 0.15,
    minViaPadDiameter: 0.34,
    defaultObstacleMargin: 0.08,
    minTraceToPadEdgeClearance: 0.08,
    minViaEdgeToPadEdgeClearance: 0.08,
    minBoardEdgeClearance: 0.5,
    allowViaInPad: false,
    obstacles,
    connections,
    buses: makeBuses(signals),
    differentialPairs: makeDifferentialPairs(signals, dataWidth),
    bounds,
    outline,
    metadata: {
      datasetName: "dataset-srj29-ddr3-bga-pairs",
      generatorSeed: 0x3dd30000 + index * 7919,
      ddr3: {
        componentId: "ddr3_bga",
        package: "synthetic FBGA-96-style",
        dataWidth,
        pitch: ddr3Pitch,
        padCount: ddr3Pads.length,
        signalPinCount: signals.length,
        note: "Signal naming and grouping are DDR3-realistic; this synthetic benchmark pin map is not vendor pin-compatible.",
      },
      controller: {
        componentId: "controller_bga",
        package: `${controllerGridSize}x${controllerGridSize} BGA`,
        pitch: controllerPitch,
        padCount: controllerPads.length,
        memoryBankDepth: controllerColumnDepth,
      },
      placement: {
        ddr3Side,
        componentGap,
        verticalOffset,
        boardMarginX: 4.8,
        boardMarginY: 5.2,
      },
      feasibility: {
        focus: "BGA-to-BGA connection routing",
        connectedDdr3ColumnDepth: ddr3ColumnDepth,
        connectedControllerColumnDepth: controllerColumnDepth,
        availableRoutingLayers: layerCount - 2,
        viaStyle: "0.34 mm dogbone-compatible via; via-in-pad disabled",
        corridorWidth: componentGap,
      },
      signalGroups: groupCounts,
      signalGroupByConnection: Object.fromEntries(signals.map((signal) => [signal.name, signal.group])),
      sourceReview: [
        "tscircuit/autorouting-dataset-01",
        "tscircuit/dataset-srj18",
        "tscircuit/dataset-srj24",
        "tscircuit/dataset-srj16-bga-breakouts",
        "tscircuit/dataset-srj19",
        "tscircuit/dataset-srj20",
      ],
    },
  }
}

function makeSampleSvg(sample, svgWidth = 1000, svgHeight = 650, showComponentLabels = true) {
  const { minX, maxX, minY, maxY } = sample.bounds
  const boardWidth = maxX - minX
  const boardHeight = maxY - minY
  const padding = 22
  const scale = Math.min((svgWidth - padding * 2) / boardWidth, (svgHeight - padding * 2) / boardHeight)
  const sx = (x) => padding + (x - minX) * scale
  const sy = (y) => svgHeight - padding - (y - minY) * scale
  const pointByName = new Map(sample.connections.map((connection) => [connection.name, connection.pointsToConnect]))
  const groupByName = sample.metadata.signalGroupByConnection

  const lines = [...pointByName].map(([name, points]) => {
    const color = GROUP_COLORS[groupByName[name]] ?? "#8796a5"
    return `<line x1="${sx(points[0].x)}" y1="${sy(points[0].y)}" x2="${sx(points[1].x)}" y2="${sy(points[1].y)}" stroke="${color}" stroke-width="0.85" opacity="0.46"/>`
  }).join("")
  const pads = sample.obstacles.map((obstacle) => {
    const fill = obstacle.componentId === "ddr3_bga" ? "#f5a742" : "#4d8cc9"
    const width = Math.max(2, obstacle.width * scale)
    const height = Math.max(2, obstacle.height * scale)
    return `<rect x="${sx(obstacle.center.x) - width / 2}" y="${sy(obstacle.center.y) - height / 2}" width="${width}" height="${height}" rx="${Math.min(width, height) * 0.22}" fill="${fill}" stroke="#0b1015" stroke-width="0.45"/>`
  }).join("")
  const ddr3Pads = sample.obstacles.filter((obstacle) => obstacle.componentId === "ddr3_bga")
  const controllerPads = sample.obstacles.filter((obstacle) => obstacle.componentId === "controller_bga")
  const centerOf = (padsForComponent) => ({
    x: padsForComponent.reduce((sum, pad) => sum + pad.center.x, 0) / padsForComponent.length,
    y: padsForComponent.reduce((sum, pad) => sum + pad.center.y, 0) / padsForComponent.length,
    minY: Math.min(...padsForComponent.map((pad) => pad.center.y - pad.height / 2)),
  })
  const ddr3Center = centerOf(ddr3Pads)
  const controllerCenter = centerOf(controllerPads)
  const componentLabels = showComponentLabels
    ? `<text x="${sx(ddr3Center.x)}" y="${Math.min(svgHeight - 24, sy(ddr3Center.minY) + 28)}" text-anchor="middle" fill="#ffc977" font-family="ui-monospace, monospace" font-size="15" font-weight="700">DDR3 x${sample.metadata.ddr3.dataWidth} · FBGA-96</text>
  <text x="${sx(controllerCenter.x)}" y="${Math.min(svgHeight - 24, sy(controllerCenter.minY) + 28)}" text-anchor="middle" fill="#88b9eb" font-family="ui-monospace, monospace" font-size="15" font-weight="700">CONTROLLER · ${sample.metadata.controller.package}</text>`
    : ""

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="#0d1218"/>
  <rect x="${sx(minX)}" y="${sy(maxY)}" width="${boardWidth * scale}" height="${boardHeight * scale}" rx="8" fill="#13251f" stroke="#4f806c" stroke-width="2"/>
  <g>${lines}</g>
  <g>${pads}</g>
  ${componentLabels}
  <text x="28" y="38" fill="#eef5fb" font-family="ui-sans-serif, system-ui" font-size="19" font-weight="700">${sample.id} · ${sample.connections.length} DDR3 signals · ${sample.layerCount} layers</text>
  <text x="28" y="61" fill="#9fb0bf" font-family="ui-sans-serif, system-ui" font-size="13">${sample.metadata.placement.componentGap} mm package gap · via-in-pad disabled · unrouted ratsnest</text>
</svg>`
}

function makeContactSheet(samples) {
  const cellWidth = 420
  const cellHeight = 270
  const cols = 4
  const rows = 5
  const cells = samples.map((sample, index) => {
    const svg = makeSampleSvg(sample, cellWidth, cellHeight, false)
      .replace(/^<\?xml[^>]*>\s*/, "")
      .replace(/^<svg[^>]*>/, "")
      .replace(/<\/svg>$/, "")
    return `<g transform="translate(${(index % cols) * cellWidth},${Math.floor(index / cols) * cellHeight})">${svg}</g>`
  }).join("")
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth * cols}" height="${cellHeight * rows}" viewBox="0 0 ${cellWidth * cols} ${cellHeight * rows}">${cells}</svg>`
}

function makeIndex(samples) {
  const lines = ["\"use strict\"", ""]
  for (const sample of samples) lines.push(`exports.${sample.id} = require("./samples/${sample.id}.json")`)
  lines.push("", "exports.dataset = {")
  for (const sample of samples) lines.push(`  ${sample.id}: exports.${sample.id},`)
  lines.push("}", "", "exports.default = exports.dataset", "")
  return lines.join("\n")
}

function makeTypes(samples) {
  const exports = samples.map((sample) => `export const ${sample.id}: SimpleRouteJson`).join("\n")
  return `export interface SimpleRoutePoint {
  x: number
  y: number
  layer?: string
  layers?: string[]
  pointId?: string
  pcb_port_id?: string
}

export interface SimpleRouteConnection {
  name: string
  rootConnectionName?: string
  netConnectionName?: string
  nominalTraceWidth?: number
  pointsToConnect: SimpleRoutePoint[]
}

export interface SimpleRouteObstacle {
  obstacleId?: string
  componentId?: string
  type: "rect"
  layers: string[]
  center: { x: number; y: number }
  width: number
  height: number
  connectedTo: string[]
}

export interface SimpleRouteJson {
  id: string
  title: string
  description: string
  layerCount: number
  minTraceWidth: number
  nominalTraceWidth?: number
  minViaHoleDiameter?: number
  minViaPadDiameter?: number
  defaultObstacleMargin?: number
  minTraceToPadEdgeClearance?: number
  minViaEdgeToPadEdgeClearance?: number
  allowViaInPad?: boolean
  obstacles: SimpleRouteObstacle[]
  connections: SimpleRouteConnection[]
  buses?: unknown[]
  differentialPairs?: unknown[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  outline?: Array<{ x: number; y: number }>
  metadata: Record<string, unknown>
}

${exports}

export const dataset: Record<string, SimpleRouteJson>
declare const defaultDataset: Record<string, SimpleRouteJson>
export default defaultDataset
`
}

await mkdir(samplesDir, { recursive: true })
await mkdir(previewsDir, { recursive: true })
const samples = Array.from({ length: SAMPLE_COUNT }, (_, index) => createSample(index + 1))

for (const sample of samples) {
  await writeFile(path.join(samplesDir, `${sample.id}.json`), `${JSON.stringify(sample, null, 2)}\n`)
  await writeFile(path.join(previewsDir, `${sample.id}.svg`), makeSampleSvg(sample))
}

const manifest = {
  datasetName: "dataset-srj29-ddr3-bga-pairs",
  sampleCount: samples.length,
  purpose: "Spacious multilayer DDR3-BGA-to-controller-BGA autorouting benchmarks",
  samples: samples.map((sample) => ({
    id: sample.id,
    title: sample.title,
    layerCount: sample.layerCount,
    connectionCount: sample.connections.length,
    obstacleCount: sample.obstacles.length,
    ddr3DataWidth: sample.metadata.ddr3.dataWidth,
    ddr3PadCount: sample.metadata.ddr3.padCount,
    controllerPackage: sample.metadata.controller.package,
    controllerPitch: sample.metadata.controller.pitch,
    componentGap: sample.metadata.placement.componentGap,
    bounds: sample.bounds,
  })),
}

await writeFile(path.join(repoRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(path.join(repoRoot, "index.js"), makeIndex(samples))
await writeFile(path.join(repoRoot, "index.d.ts"), makeTypes(samples))
await writeFile(path.join(previewsDir, "contact-sheet.svg"), makeContactSheet(samples))

console.log(`Generated ${samples.length} DDR3-to-BGA SRJ samples`)
