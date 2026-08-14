import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const samplesDir = path.join(repoRoot, "samples")
const previewsDir = path.join(repoRoot, "previews")
const connectionMapPath = path.join(repoRoot, "reference", "beaglebone-black-ddr3-map.json")
const realConnectionMap = JSON.parse(await readFile(connectionMapPath, "utf8"))

const SAMPLE_COUNT = 20
const DDR3_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "R", "T"]
const DDR3_POPULATED_COLUMNS = [0, 1, 2, 6, 7, 8]
const CONTROLLER_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "R", "T", "U", "V"]
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

function makeGrid({ rows, cols, pitch, padSize, centerX, centerY, componentId, keep, rotation = 0 }) {
  const xOffset = ((cols - 1) * pitch) / 2
  const yOffset = ((rows.length - 1) * pitch) / 2
  const pads = []
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < cols; col++) {
      if (keep && !keep(row, col)) continue
      const localX = col * pitch - xOffset
      const localY = yOffset - row * pitch
      const rotatedX = rotation === 180 ? -localX : localX
      const rotatedY = rotation === 180 ? -localY : localY
      pads.push({
        row,
        col,
        ball: `${rows[row]}${col + 1}`,
        x: round(centerX + rotatedX),
        y: round(centerY + rotatedY),
        width: padSize,
        height: padSize,
        pitch,
        componentId,
      })
    }
  }
  return pads
}

function createObstacle(pad, connection, pinName) {
  const componentPrefix = pad.componentId === "ddr3_bga" ? "ddr3" : "controller"
  const padId = `${componentPrefix}_${safeId(pad.ball)}`
  return {
    obstacleId: `pcb_smtpad_${padId}`,
    componentId: pad.componentId,
    type: "rect",
    layers: ["top"],
    center: { x: pad.x, y: pad.y },
    width: pad.width,
    height: pad.height,
    ballName: pad.ball,
    vendorPinName: pinName,
    connectedTo: connection
      ? [connection.net, `pcb_port_${componentPrefix}_${safeId(connection.net)}`]
      : [`unconnected_${padId}`],
    circuitJsonMetadata: {
      source_component_name: componentPrefix === "ddr3" ? "U12_DDR3L" : "U5_AM3358",
      source_port_name: pinName,
      reference_design_net: connection?.net,
    },
  }
}

function makeBuses(connections) {
  const names = (groups) => connections.filter((connection) => groups.includes(connection.group)).map((connection) => connection.net)
  return [
    { busId: "ddr3_data_bus", connectionNames: names(["data", "strobe", "mask"]), maxLengthSkew: 1.5, traceWidth: 0.12 },
    { busId: "ddr3_address_command_bus", connectionNames: names(["address", "bank", "command", "control", "clock"]), maxLengthSkew: 2.5, traceWidth: 0.12 },
  ]
}

function makeDifferentialPairs() {
  return [
    { connectionNames: ["DDR_CLK", "DDR_CLKn"], lengthTolerance: 0.8, traceGap: 0.18, maxUncoupledLength: 5 },
    { connectionNames: ["DDR_DQS0", "DDR_DQSN0"], lengthTolerance: 0.8, traceGap: 0.18, maxUncoupledLength: 5 },
    { connectionNames: ["DDR_DQS1", "DDR_DQSN1"], lengthTolerance: 0.8, traceGap: 0.18, maxUncoupledLength: 5 },
  ]
}

function createSample(index) {
  const mapping = realConnectionMap.connections
  const ddr3OnLeft = index % 4 !== 0
  const rotation = ddr3OnLeft ? 0 : 180
  const ddr3Side = ddr3OnLeft ? "left" : "right"
  const controllerSide = ddr3OnLeft ? "right" : "left"
  const pitch = 0.8
  const padSize = 0.38
  const ddr3FieldWidth = 8 * pitch + padSize
  const controllerFieldWidth = 17 * pitch + padSize
  const componentGap = round(9.2 + ((index * 7) % 6) * 0.8)
  const verticalOffset = round(((index * 5) % 7 - 3) * 0.8)
  const ddr3XAbs = componentGap / 2 + ddr3FieldWidth / 2
  const controllerXAbs = componentGap / 2 + controllerFieldWidth / 2
  const ddr3CenterX = round(ddr3OnLeft ? -ddr3XAbs : ddr3XAbs)
  const controllerCenterX = round(ddr3OnLeft ? controllerXAbs : -controllerXAbs)
  const ddr3CenterY = verticalOffset / 2
  const controllerCenterY = -verticalOffset / 2
  const layerCount = index % 3 === 0 ? 14 : 12

  const ddr3Pads = makeGrid({
    rows: DDR3_ROWS,
    cols: 9,
    pitch,
    padSize,
    centerX: ddr3CenterX,
    centerY: ddr3CenterY,
    componentId: "ddr3_bga",
    rotation,
    keep: (_row, col) => DDR3_POPULATED_COLUMNS.includes(col),
  })
  const controllerPads = makeGrid({
    rows: CONTROLLER_ROWS,
    cols: 18,
    pitch,
    padSize,
    centerX: controllerCenterX,
    centerY: controllerCenterY,
    componentId: "controller_bga",
    rotation,
  })

  const ddr3ConnectionByBall = new Map(mapping.map((connection) => [connection.ddr3.ball, connection]))
  const controllerConnectionByBall = new Map(mapping.map((connection) => [connection.controller.ball, connection]))
  const ddr3PadByBall = new Map(ddr3Pads.map((pad) => [pad.ball, pad]))
  const controllerPadByBall = new Map(controllerPads.map((pad) => [pad.ball, pad]))
  const obstacles = [
    ...ddr3Pads.map((pad) => {
      const connection = ddr3ConnectionByBall.get(pad.ball)
      return createObstacle(pad, connection, connection?.ddr3.signal ?? `NON_INTERFACE_${pad.ball}`)
    }),
    ...controllerPads.map((pad) => {
      const connection = controllerConnectionByBall.get(pad.ball)
      return createObstacle(pad, connection, connection?.controller.signal ?? `NON_DDR_${pad.ball}`)
    }),
  ]
  const connections = mapping.map((connection) => {
    const ddr3Pad = ddr3PadByBall.get(connection.ddr3.ball)
    const controllerPad = controllerPadByBall.get(connection.controller.ball)
    if (!ddr3Pad || !controllerPad) throw new Error(`${connection.net}: mapped ball is absent from its physical package`)
    return {
      name: connection.net,
      rootConnectionName: connection.net,
      netConnectionName: connection.net,
      nominalTraceWidth: 0.12,
      pointsToConnect: [
        {
          x: ddr3Pad.x,
          y: ddr3Pad.y,
          layer: "top",
          pointId: `point_ddr3_${safeId(connection.net)}`,
          pcb_port_id: `pcb_port_ddr3_${safeId(connection.net)}`,
        },
        {
          x: controllerPad.x,
          y: controllerPad.y,
          layer: "top",
          pointId: `point_controller_${safeId(connection.net)}`,
          pcb_port_id: `pcb_port_controller_${safeId(connection.net)}`,
        },
      ],
    }
  })

  const minX = Math.min(...obstacles.map((obstacle) => obstacle.center.x - obstacle.width / 2)) - 5.5
  const maxX = Math.max(...obstacles.map((obstacle) => obstacle.center.x + obstacle.width / 2)) + 5.5
  const minY = Math.min(...obstacles.map((obstacle) => obstacle.center.y - obstacle.height / 2)) - 5.5
  const maxY = Math.max(...obstacles.map((obstacle) => obstacle.center.y + obstacle.height / 2)) + 5.5
  const bounds = { minX: round(minX), maxX: round(maxX), minY: round(minY), maxY: round(maxY) }
  const outline = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ]
  const groupCounts = Object.fromEntries(
    Object.keys(GROUP_COLORS).map((group) => [group, mapping.filter((connection) => connection.group === group).length]),
  )

  return {
    id: sampleName(index),
    title: `BeagleBone Black DDR3L U12 to AM3358BZCZ100 U5 · geometry ${index}`,
    description: "A spacious multilayer routing problem whose 50 endpoint pairs reproduce the official BeagleBone Black U12 DDR3L-to-U5 AM3358 schematic ball-for-ball.",
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
    buses: makeBuses(mapping),
    differentialPairs: makeDifferentialPairs(),
    bounds,
    outline,
    metadata: {
      datasetName: "dataset-srj29-ddr3-bga-pairs",
      generatorSeed: 0x3dd30000 + index * 7919,
      referenceDesign: {
        board: realConnectionMap.referenceDesign.board,
        schematicRevision: realConnectionMap.referenceDesign.schematicRevision,
        schematicSheet: realConnectionMap.referenceDesign.schematicSheet,
        connectionMapFile: "reference/beaglebone-black-ddr3-map.json",
        directConnectionCount: mapping.length,
        schematicUrl: realConnectionMap.referenceDesign.schematicUrl,
      },
      ddr3: {
        componentId: "ddr3_bga",
        reference: "U12",
        partNumber: realConnectionMap.referenceDesign.memoryPartNumbersPrintedOnSchematic[0],
        partNumbers: realConnectionMap.referenceDesign.memoryPartNumbersPrintedOnSchematic,
        package: "96-ball FBGA",
        technology: "DDR3L",
        dataWidth: 16,
        pitch,
        bodyWidth: 7.5,
        bodyHeight: 13.3,
        rowLabels: DDR3_ROWS,
        populatedColumns: [1, 2, 3, 7, 8, 9],
        padCount: ddr3Pads.length,
        signalPinCount: mapping.length,
        rotation,
        ballMapOrientation: `vendor top-view ballout rotated ${rotation} degrees on PCB`,
        sourceUrl: realConnectionMap.referenceDesign.schematicUrl,
        note: "The sparse 96-ball population and every connected ball follow U12 on the official board schematic. Non-interface balls remain physical obstacles but are outside the routing-net scope.",
      },
      controller: {
        componentId: "controller_bga",
        reference: "U5",
        partNumber: "AM3358BZCZ100",
        package: "ZCZ 324-ball NFBGA",
        grid: "18x18 full ball field",
        pitch,
        bodyWidth: 15,
        bodyHeight: 15,
        padCount: controllerPads.length,
        rotation,
        memoryBankDepth: 5,
        sourceUrl: realConnectionMap.referenceDesign.processorProductUrl,
      },
      placement: {
        ddr3Side,
        controllerSide,
        componentGap,
        componentGapDefinition: "minimum horizontal clearance between the two physical pad-field edges",
        verticalOffset,
        boardMarginX: 5.5,
        boardMarginY: 5.5,
      },
      feasibility: {
        focus: "fan out both real BGA footprints, then route the real chip-to-chip DDR interface",
        connectedDdr3ColumnDepth: 6,
        connectedControllerColumnDepth: 5,
        availableRoutingLayers: layerCount - 2,
        viaStyle: "0.34 mm dogbone-compatible via; via-in-pad disabled",
        corridorWidth: componentGap,
      },
      signalGroups: groupCounts,
      signalGroupByConnection: Object.fromEntries(mapping.map((connection) => [connection.net, connection.group])),
      endpointBallsByConnection: Object.fromEntries(mapping.map((connection) => [connection.net, {
        ddr3Ball: connection.ddr3.ball,
        ddr3Signal: connection.ddr3.signal,
        controllerBall: connection.controller.ball,
        controllerSignal: connection.controller.signal,
      }])),
      sourceReview: [
        "beagleboard/beaglebone-black BBB-SCH.pdf sheets 3 and 7",
        "BeagleBoard BeagleBone Black System Reference Manual chapter 6",
        "Texas Instruments AM3358BZCZ100 product/package specification",
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
  const groupByName = sample.metadata.signalGroupByConnection
  const lines = sample.connections.map((connection) => {
    const points = connection.pointsToConnect
    const color = GROUP_COLORS[groupByName[connection.name]] ?? "#8796a5"
    return `<line x1="${sx(points[0].x)}" y1="${sy(points[0].y)}" x2="${sx(points[1].x)}" y2="${sy(points[1].y)}" stroke="${color}" stroke-width="0.85" opacity="0.46"/>`
  }).join("")
  const pads = sample.obstacles.map((obstacle) => {
    const fill = obstacle.componentId === "ddr3_bga" ? "#f5a742" : "#4d8cc9"
    const width = Math.max(2, obstacle.width * scale)
    const height = Math.max(2, obstacle.height * scale)
    return `<rect x="${sx(obstacle.center.x) - width / 2}" y="${sy(obstacle.center.y) - height / 2}" width="${width}" height="${height}" rx="${Math.min(width, height) * 0.22}" fill="${fill}" stroke="#0b1015" stroke-width="0.45"/>`
  }).join("")
  const componentBounds = (componentId) => {
    const componentPads = sample.obstacles.filter((obstacle) => obstacle.componentId === componentId)
    return {
      x: componentPads.reduce((sum, pad) => sum + pad.center.x, 0) / componentPads.length,
      minY: Math.min(...componentPads.map((pad) => pad.center.y - pad.height / 2)),
    }
  }
  const ddr3 = componentBounds("ddr3_bga")
  const controller = componentBounds("controller_bga")
  const componentLabels = showComponentLabels
    ? `<text x="${sx(ddr3.x)}" y="${Math.min(svgHeight - 24, sy(ddr3.minY) + 28)}" text-anchor="middle" fill="#ffc977" font-family="ui-monospace, monospace" font-size="14" font-weight="700">U12 · DDR3L x16 · 96-ball</text>
  <text x="${sx(controller.x)}" y="${Math.min(svgHeight - 24, sy(controller.minY) + 28)}" text-anchor="middle" fill="#88b9eb" font-family="ui-monospace, monospace" font-size="14" font-weight="700">U5 · AM3358BZCZ100 · 324-ball</text>`
    : ""
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="#0d1218"/>
  <rect x="${sx(minX)}" y="${sy(maxY)}" width="${boardWidth * scale}" height="${boardHeight * scale}" rx="8" fill="#13251f" stroke="#4f806c" stroke-width="2"/>
  <g>${lines}</g>
  <g>${pads}</g>
  ${componentLabels}
  <text x="28" y="38" fill="#eef5fb" font-family="ui-sans-serif, system-ui" font-size="19" font-weight="700">${sample.id} · 50 real board nets · ${sample.layerCount} layers</text>
  <text x="28" y="61" fill="#9fb0bf" font-family="ui-sans-serif, system-ui" font-size="13">BeagleBone Black D1 U12↔U5 map · ${sample.metadata.placement.componentGap} mm gap · unrouted</text>
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

function makeConnectionMapMarkdown() {
  const rows = realConnectionMap.connections.map((connection) =>
    `| ${connection.net} | ${connection.ddr3.ball} | ${connection.ddr3.signal} | ${connection.controller.ball} | ${connection.controller.signal} |`,
  ).join("\n")
  return `# BeagleBone Black DDR3L connection map

This is the endpoint map used by every sample. It was transcribed from the official BeagleBone Black D1 schematic: U12 on sheet 7 and U5 on sheet 3.

| Board net | U12 ball | U12 pin | U5 ball | AM3358 pin |
|---|---:|---|---:|---|
${rows}

The machine-readable source of truth is [\`reference/beaglebone-black-ddr3-map.json\`](reference/beaglebone-black-ddr3-map.json). Power, ground, VREF, ZQ, decoupling, and external termination components are excluded because they are not direct U12-to-U5 nets.
`
}

function makeTypes(samples) {
  const exports = samples.map((sample) => `export const ${sample.id}: SimpleRouteJson`).join("\n")
  return `export interface SimpleRoutePoint { x: number; y: number; layer?: string; layers?: string[]; pointId?: string; pcb_port_id?: string }
export interface SimpleRouteConnection { name: string; rootConnectionName?: string; netConnectionName?: string; nominalTraceWidth?: number; pointsToConnect: SimpleRoutePoint[] }
export interface SimpleRouteObstacle { obstacleId?: string; componentId?: string; ballName?: string; vendorPinName?: string; type: "rect"; layers: string[]; center: { x: number; y: number }; width: number; height: number; connectedTo: string[] }
export interface SimpleRouteJson { id: string; title: string; description: string; layerCount: number; minTraceWidth: number; nominalTraceWidth?: number; minViaHoleDiameter?: number; minViaPadDiameter?: number; defaultObstacleMargin?: number; minTraceToPadEdgeClearance?: number; minViaEdgeToPadEdgeClearance?: number; allowViaInPad?: boolean; obstacles: SimpleRouteObstacle[]; connections: SimpleRouteConnection[]; buses?: unknown[]; differentialPairs?: unknown[]; bounds: { minX: number; maxX: number; minY: number; maxY: number }; outline?: Array<{ x: number; y: number }>; metadata: Record<string, unknown> }

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
  purpose: "Spacious multilayer ball-accurate BeagleBone Black DDR3L-to-AM3358 BGA routing benchmarks",
  referenceDesign: realConnectionMap.referenceDesign,
  connectionMapFile: "reference/beaglebone-black-ddr3-map.json",
  samples: samples.map((sample) => ({
    id: sample.id,
    title: sample.title,
    layerCount: sample.layerCount,
    connectionCount: sample.connections.length,
    obstacleCount: sample.obstacles.length,
    ddr3PadCount: sample.metadata.ddr3.padCount,
    controllerPadCount: sample.metadata.controller.padCount,
    componentGap: sample.metadata.placement.componentGap,
    rotation: sample.metadata.ddr3.rotation,
    bounds: sample.bounds,
  })),
}
await writeFile(path.join(repoRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(path.join(repoRoot, "index.js"), makeIndex(samples))
await writeFile(path.join(repoRoot, "index.d.ts"), makeTypes(samples))
await writeFile(path.join(repoRoot, "CONNECTION_MAP.md"), makeConnectionMapMarkdown())
await writeFile(path.join(previewsDir, "contact-sheet.svg"), makeContactSheet(samples))
console.log(`Generated ${samples.length} ball-accurate BeagleBone Black DDR3L-to-AM3358 SRJ samples`)
