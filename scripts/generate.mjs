import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const samplesDir = path.join(repoRoot, "samples")
const previewsDir = path.join(repoRoot, "previews")
const referenceManifest = JSON.parse(await readFile(path.join(repoRoot, "reference", "reference-manifest.json"), "utf8"))
const maps = await Promise.all(referenceManifest.map(async (entry) => ({
  manifestEntry: entry,
  map: JSON.parse(await readFile(path.join(repoRoot, entry.mapFile), "utf8")),
})))

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

const ROUTED_CONNECTION_COUNT = 16
const ROUTED_GROUP_COUNTS = {
  data: 4,
  strobe: 2,
  mask: 1,
  address: 3,
  bank: 1,
  command: 2,
  clock: 2,
  control: 1,
}

const round = (value, precision = 5) => Number(value.toFixed(precision))
const sampleName = (index) => `sample${String(index).padStart(3, "0")}`
const safeId = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
const evenCeiling = (value) => Math.ceil(value / 2) * 2

function transformPackage(packageData, componentId, center, rotation) {
  return packageData.pads.map((pad) => {
    const x = rotation === 180 ? -pad.x : pad.x
    const y = rotation === 180 ? -pad.y : pad.y
    return {
      ball: pad.ball,
      vendorSignal: pad.signal,
      x: round(center.x + x),
      y: round(center.y + y),
      width: pad.width,
      height: pad.height,
      shape: pad.shape,
      componentId,
    }
  })
}

function getPadBounds(pads) {
  return {
    minX: Math.min(...pads.map((pad) => pad.x - pad.width / 2)),
    maxX: Math.max(...pads.map((pad) => pad.x + pad.width / 2)),
    minY: Math.min(...pads.map((pad) => pad.y - pad.height / 2)),
    maxY: Math.max(...pads.map((pad) => pad.y + pad.height / 2)),
  }
}

function makeConnectionName(connection) {
  return `DDR3_${safeId(connection.memory.ball)}_${safeId(connection.net)}`
}

function getSignalGroup(connection) {
  const signal = String(connection.memory.signal).toUpperCase().replace(/[~{}#]/g, "").replace(/[+-]$/, "")
  if (/^(?:[A-Z0-9]+_)?(?:U?DM|LDM|DM[UL]|DQM\d*)(?:$|\/)/.test(signal)) return "mask"
  if (/DQS/.test(signal)) return "strobe"
  if (/(?:CKE|CLK_EN)/.test(signal)) return "control"
  if (/(?:^|_)(?:CK|CKN|CLK)(?:$|_[PN]$)/.test(signal)) return "clock"
  if (/(?:RAS|CAS)(?:N)?$|(?:^|_)WE(?:N)?$/.test(signal)) return "command"
  if (/(?:^|_)BA\d+$/.test(signal)) return "bank"
  if (/(?:^|_)A\d+(?:\/AP)?$/.test(signal)) return "address"
  if (/(?:^|_)(?:DQ[UL]?\d+|D\d+)$/.test(signal)) return "data"
  return connection.group
}

function selectRoutedConnections(connections) {
  const normalizedConnections = connections.map((connection) => ({
    ...connection,
    group: getSignalGroup(connection),
  }))
  const selected = new Set()
  for (const [group, count] of Object.entries(ROUTED_GROUP_COUNTS)) {
    for (const connection of normalizedConnections.filter((connection) => connection.group === group).slice(0, count)) {
      selected.add(connection)
    }
  }
  for (const connection of normalizedConnections) {
    if (selected.size >= ROUTED_CONNECTION_COUNT) break
    selected.add(connection)
  }
  if (selected.size !== ROUTED_CONNECTION_COUNT) {
    throw new Error(`Reference map has only ${selected.size} routable DDR3 signal connections`)
  }
  return normalizedConnections.filter((connection) => selected.has(connection))
}

function createObstacle(pad, connection, packageData) {
  const componentPrefix = pad.componentId === "ddr3_bga" ? "ddr3" : "controller"
  const padId = `${componentPrefix}_${safeId(pad.ball)}`
  const connectionName = connection?.connectionName
  return {
    obstacleId: `pcb_smtpad_${padId}`,
    componentId: pad.componentId,
    type: "rect",
    layers: ["top"],
    center: { x: pad.x, y: pad.y },
    width: pad.width,
    height: pad.height,
    ballName: pad.ball,
    vendorPinName: connection?.signal ?? pad.vendorSignal ?? pad.ball,
    connectedTo: connectionName
      ? [connectionName, `pcb_port_${componentPrefix}_${safeId(connectionName)}`]
      : [`unconnected_${padId}`],
    circuitJsonMetadata: {
      source_component_name: `${packageData.reference}_${packageData.partNumber}`,
      source_port_name: connection?.signal ?? pad.vendorSignal ?? pad.ball,
      reference_design_net: connection?.referenceNet,
    },
  }
}

function makeBuses(connections) {
  const names = (groups) => connections.filter((connection) => groups.includes(connection.group)).map((connection) => connection.connectionName)
  return [
    { busId: "ddr3_data_bus", connectionNames: names(["data", "strobe", "mask"]), maxLengthSkew: 1.5, traceWidth: 0.1 },
    { busId: "ddr3_address_command_bus", connectionNames: names(["address", "bank", "command", "control", "clock"]), maxLengthSkew: 2.5, traceWidth: 0.1 },
  ].filter((bus) => bus.connectionNames.length > 0)
}

function pairDescriptor(connection) {
  const raw = `${connection.memory.signal} ${connection.net}`.toUpperCase().replace(/[~{}]/g, "")
  const signal = raw.split(/\s+/)[0]
  let polarity
  if (/#|(?:^|[_./])N(?:$|[_./])|_N$|-$/.test(signal)) polarity = "negative"
  else if (/\+|_P$|(?:^|[_./])P(?:$|[_./])/.test(signal)) polarity = "positive"
  else if (/DQS|(?:^|_)CK(?:$|\d)/.test(signal)) polarity = "positive"
  const base = signal
    .replace(/#/g, "")
    .replace(/[+-]$/g, "")
    .replace(/_(?:P|N)$/g, "")
    .replace(/(?:P|N)$/g, "")
  return { base, polarity }
}

function makeDifferentialPairs(connections) {
  const groups = new Map()
  for (const connection of connections.filter((item) => item.group === "strobe" || item.group === "clock")) {
    const descriptor = pairDescriptor(connection)
    if (!groups.has(descriptor.base)) groups.set(descriptor.base, [])
    groups.get(descriptor.base).push({ connection, ...descriptor })
  }
  return [...groups.values()].filter((group) => group.length === 2).map((group) => ({
    connectionNames: group.sort((a, b) => (a.polarity === "positive" ? -1 : 1)).map((entry) => entry.connection.connectionName),
    lengthTolerance: 0.8,
    traceGap: 0.18,
    maxUncoupledLength: 5,
  }))
}

function connectedDepth(packageData, connectedBalls) {
  const pads = packageData.pads.filter((pad) => connectedBalls.has(pad.ball))
  if (pads.length === 0) return 0
  const field = getPadBounds(packageData.pads)
  return Math.max(...pads.map((pad) => Math.min(
    (pad.x - field.minX) / packageData.pitch,
    (field.maxX - pad.x) / packageData.pitch,
    (pad.y - field.minY) / packageData.pitch,
    (field.maxY - pad.y) / packageData.pitch,
  )))
}

function createDdr3Sample(index, mapRecord) {
  const { map, manifestEntry } = mapRecord
  const id = sampleName(index)
  const memoryOnLeft = index % 4 !== 0
  const rotation = index % 3 === 0 ? 180 : 0
  const componentGap = round(12 + ((index * 7) % 5) * 1.5)
  const verticalOffset = round(((index * 3) % 7 - 3) * 1.2)
  const memoryCenter = {
    x: memoryOnLeft ? -(componentGap + map.memory.padFieldWidth) / 2 : (componentGap + map.memory.padFieldWidth) / 2,
    y: verticalOffset / 2,
  }
  const controllerCenter = {
    x: memoryOnLeft ? (componentGap + map.controller.padFieldWidth) / 2 : -(componentGap + map.controller.padFieldWidth) / 2,
    y: -verticalOffset / 2,
  }
  const memoryPads = transformPackage(map.memory, "ddr3_bga", memoryCenter, rotation)
  const controllerPads = transformPackage(map.controller, "controller_bga", controllerCenter, rotation)
  const routedConnections = selectRoutedConnections(map.connections)
  const connectionRecords = routedConnections.map((connection) => ({
    ...connection,
    connectionName: makeConnectionName(connection),
  }))
  const memoryConnectionByBall = new Map(connectionRecords.map((connection) => [connection.memory.ball, {
    connectionName: connection.connectionName,
    referenceNet: connection.net,
    signal: connection.memory.signal,
  }]))
  const controllerConnectionByBall = new Map(connectionRecords.map((connection) => [connection.controller.ball, {
    connectionName: connection.connectionName,
    referenceNet: connection.net,
    signal: connection.controller.signal,
  }]))
  const memoryPadByBall = new Map(memoryPads.map((pad) => [pad.ball, pad]))
  const controllerPadByBall = new Map(controllerPads.map((pad) => [pad.ball, pad]))
  const obstacles = [
    ...memoryPads.map((pad) => createObstacle(pad, memoryConnectionByBall.get(pad.ball), map.memory)),
    ...controllerPads.map((pad) => createObstacle(pad, controllerConnectionByBall.get(pad.ball), map.controller)),
  ]

  const minimumPitch = Math.min(map.memory.pitch, map.controller.pitch)
  const nominalTraceWidth = round(Math.min(0.1, minimumPitch * 0.16), 4)
  const clearance = round(Math.min(0.075, minimumPitch * 0.1), 4)
  const maximumDogboneViaDiameter = Math.min(
    ...[map.memory, map.controller].map((packageData) => {
      const maximumPadHalfDiagonal = Math.max(
        ...packageData.pads.map((pad) => Math.hypot(pad.width, pad.height) / 2),
      )
      return 2 * (packageData.pitch / Math.sqrt(2) - maximumPadHalfDiagonal - clearance)
    }),
  )
  if (maximumDogboneViaDiameter < 0.16) {
    throw new Error(`${id}: source pad geometry leaves no conservative dogbone-via clearance`)
  }
  const viaPadDiameter = round(
    Math.max(0.16, Math.min(minimumPitch * 0.42, maximumDogboneViaDiameter * 0.95)),
    4,
  )
  const viaHoleDiameter = round(Math.max(0.08, viaPadDiameter * 0.45), 4)
  const memoryDepth = connectedDepth(map.memory, new Set(routedConnections.map((connection) => connection.memory.ball)))
  const controllerDepth = connectedDepth(map.controller, new Set(routedConnections.map((connection) => connection.controller.ball)))
  const layerCount = Math.max(
    18,
    evenCeiling(Math.max(memoryDepth, controllerDepth) * 2 + 6),
    evenCeiling(routedConnections.length / 3.5 + 2),
  )

  const connections = connectionRecords.map((connection) => {
    const memoryPad = memoryPadByBall.get(connection.memory.ball)
    const controllerPad = controllerPadByBall.get(connection.controller.ball)
    if (!memoryPad || !controllerPad) throw new Error(`${id}: ${connection.net} references an absent package ball`)
    return {
      name: connection.connectionName,
      rootConnectionName: connection.connectionName,
      netConnectionName: connection.connectionName,
      nominalTraceWidth,
      pointsToConnect: [
        {
          x: memoryPad.x,
          y: memoryPad.y,
          layer: "top",
          pointId: `point_ddr3_${safeId(connection.connectionName)}`,
          pcb_port_id: `pcb_port_ddr3_${safeId(connection.connectionName)}`,
        },
        {
          x: controllerPad.x,
          y: controllerPad.y,
          layer: "top",
          pointId: `point_controller_${safeId(connection.connectionName)}`,
          pcb_port_id: `pcb_port_controller_${safeId(connection.connectionName)}`,
        },
      ],
    }
  })

  const padBounds = getPadBounds([...memoryPads, ...controllerPads])
  const boardMargin = 7
  const bounds = {
    minX: round(padBounds.minX - boardMargin),
    maxX: round(padBounds.maxX + boardMargin),
    minY: round(padBounds.minY - boardMargin),
    maxY: round(padBounds.maxY + boardMargin),
  }
  const outline = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ]
  const signalGroups = Object.fromEntries(Object.keys(GROUP_COLORS).map((group) => [
    group,
    connectionRecords.filter((connection) => connection.group === group).length,
  ]))
  const referenceNetByConnection = Object.fromEntries(connectionRecords.map((connection) => [connection.connectionName, connection.net]))
  const endpointBallsByConnection = Object.fromEntries(connectionRecords.map((connection) => [connection.connectionName, {
    ddr3Ball: connection.memory.ball,
    ddr3Signal: connection.memory.signal,
    controllerBall: connection.controller.ball,
    controllerSignal: connection.controller.signal,
    referenceNet: connection.net,
    sourcePath: connection.sourcePath,
  }]))

  return {
    id,
    title: `${map.referenceDesign.board}: ${map.memory.partNumber} ${map.memory.reference} to ${map.controller.partNumber} ${map.controller.reference}`,
    description: `A spacious multilayer benchmark routing a balanced ${connectionRecords.length}-net subset of ${map.connections.length} exact DDR3-to-BGA endpoint pairs from ${map.referenceDesign.board}.`,
    layerCount,
    minTraceWidth: nominalTraceWidth,
    nominalTraceWidth,
    minViaHoleDiameter: viaHoleDiameter,
    minViaPadDiameter: viaPadDiameter,
    defaultObstacleMargin: clearance,
    minTraceToPadEdgeClearance: clearance,
    minViaEdgeToPadEdgeClearance: clearance,
    minBoardEdgeClearance: 0.5,
    allowViaInPad: false,
    obstacles,
    connections,
    buses: makeBuses(connectionRecords),
    differentialPairs: makeDifferentialPairs(connectionRecords),
    bounds,
    outline,
    metadata: {
      datasetName: "dataset-srj29-ddr3-bga-pairs",
      generatorSeed: 0x3dd30000 + index * 7919,
      referenceDesign: {
        ...map.referenceDesign,
        connectionMapFile: manifestEntry.mapFile,
        directConnectionCount: connectionRecords.length,
        sourceDirectConnectionCount: map.connections.length,
        endpointMapSha256: map.endpointMapSha256,
      },
      ddr3: {
        componentId: "ddr3_bga",
        reference: map.memory.reference,
        partNumber: map.memory.partNumber,
        footprint: map.memory.footprint,
        padCount: map.memory.padCount,
        pitch: map.memory.pitch,
        padFieldWidth: map.memory.padFieldWidth,
        padFieldHeight: map.memory.padFieldHeight,
        technology: "DDR3 / DDR3L",
        signalPinCount: connectionRecords.length,
        rotation,
        bodyWidth: round(map.memory.padFieldWidth + map.memory.pitch),
        bodyHeight: round(map.memory.padFieldHeight + map.memory.pitch),
      },
      controller: {
        componentId: "controller_bga",
        reference: map.controller.reference,
        partNumber: map.controller.partNumber,
        footprint: map.controller.footprint,
        padCount: map.controller.padCount,
        pitch: map.controller.pitch,
        padFieldWidth: map.controller.padFieldWidth,
        padFieldHeight: map.controller.padFieldHeight,
        rotation,
        bodyWidth: round(map.controller.padFieldWidth + map.controller.pitch),
        bodyHeight: round(map.controller.padFieldHeight + map.controller.pitch),
      },
      placement: {
        ddr3Side: memoryOnLeft ? "left" : "right",
        controllerSide: memoryOnLeft ? "right" : "left",
        componentGap,
        componentGapDefinition: "minimum horizontal clearance between the physical pad-field edges",
        verticalOffset,
        boardMargin,
      },
      feasibility: {
        focus: "fan out both real BGA footprints, then route a representative subset of exact reference DDR3 endpoint pairs",
        connectedDdr3EdgeDepth: round(memoryDepth, 2),
        connectedControllerEdgeDepth: round(controllerDepth, 2),
        availableRoutingLayers: layerCount - 2,
        minimumPackagePitch: minimumPitch,
        viaStyle: `${viaPadDiameter} mm dogbone-compatible via pad; via-in-pad disabled`,
        corridorWidth: componentGap,
      },
      signalGroups,
      signalGroupByConnection: Object.fromEntries(connectionRecords.map((connection) => [connection.connectionName, connection.group])),
      referenceNetByConnection,
      endpointBallsByConnection,
    },
  }
}

function createPublishedReproSample(index, mapRecord) {
  const { map, manifestEntry } = mapRecord
  const id = sampleName(index)
  const memoryPadByBall = new Map(map.memory.pads.map((pad) => [pad.ball, pad]))
  const controllerPadByBall = new Map(map.controller.pads.map((pad) => [pad.ball, pad]))
  const connectionByMemoryBall = new Map(map.connections.map((connection) => [connection.memory.ball, connection]))
  const connectionByControllerBall = new Map(map.connections.map((connection) => [connection.controller.ball, connection]))
  const makeObstacle = (pad, packageData, connection) => ({
    obstacleId: pad.obstacleId,
    componentId: packageData.componentId,
    type: "rect",
    shape: pad.shape,
    layers: ["top"],
    center: { x: pad.x, y: pad.y },
    width: pad.width,
    height: pad.height,
    ballName: pad.ball,
    vendorPinName: pad.signal,
    connectedTo: connection
      ? [connection.net, pad.pcbPortId]
      : [`unconnected_${pad.obstacleId}`],
    circuitJsonMetadata: {
      source_component_name: `${packageData.reference}_${packageData.partNumber}`,
      source_port_name: pad.signal,
      source_package_ball: pad.ball,
      published_pcb_port_id: pad.pcbPortId,
    },
  })
  const obstacles = [
    ...map.controller.pads.map((pad) => makeObstacle(pad, map.controller, connectionByControllerBall.get(pad.ball))),
    ...map.memory.pads.map((pad) => makeObstacle(pad, map.memory, connectionByMemoryBall.get(pad.ball))),
  ]
  const connections = map.connections.map((connection) => {
    const controllerPad = controllerPadByBall.get(connection.controller.ball)
    const memoryPad = memoryPadByBall.get(connection.memory.ball)
    if (!controllerPad || !memoryPad) throw new Error(`${id}: ${connection.net} references an absent package ball`)
    return {
      name: connection.net,
      rootConnectionName: connection.net,
      netConnectionName: connection.net,
      nominalTraceWidth: map.board.nominalTraceWidth,
      pointsToConnect: [
        {
          x: controllerPad.x,
          y: controllerPad.y,
          layer: "top",
          pointId: controllerPad.pcbPortId,
          pcb_port_id: controllerPad.pcbPortId,
        },
        {
          x: memoryPad.x,
          y: memoryPad.y,
          layer: "top",
          pointId: memoryPad.pcbPortId,
          pcb_port_id: memoryPad.pcbPortId,
        },
      ],
    }
  })
  const bounds = {
    minX: round(map.board.center.x - map.board.width / 2),
    maxX: round(map.board.center.x + map.board.width / 2),
    minY: round(map.board.center.y - map.board.height / 2),
    maxY: round(map.board.center.y + map.board.height / 2),
  }
  const outline = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ]
  const memoryBounds = getPadBounds(map.memory.pads)
  const controllerBounds = getPadBounds(map.controller.pads)
  const componentGap = round(memoryBounds.minX - controllerBounds.maxX)
  const signalGroupByConnection = Object.fromEntries(map.connections.map((connection) => {
    const signal = connection.memory.signal
    const group = /^DQ\d+$/.test(signal)
      ? "data"
      : /^DQS/.test(signal)
        ? "strobe"
        : /^DMI/.test(signal)
          ? "mask"
          : /^CA/.test(signal)
            ? "address"
            : /^CK_[tc]$/.test(signal)
              ? "clock"
              : /^(?:CKE|RESET)/.test(signal)
                ? "control"
                : "command"
    return [connection.net, group]
  }))

  return {
    id,
    title: "AM62L32 ↔ MT53E1G16D1ZW LPDDR4 automatic-breakout reproduction",
    description: "An exact flat Simple Route JSON reproduction of the published 8-layer AM62L32-to-LPDDR4 board geometry, package balls, design rules, and all 33 direct DDR connections.",
    layerCount: map.board.layerCount,
    minTraceWidth: map.board.minTraceWidth,
    nominalTraceWidth: map.board.nominalTraceWidth,
    minViaHoleDiameter: map.board.minViaHoleDiameter,
    minViaPadDiameter: map.board.minViaPadDiameter,
    defaultObstacleMargin: map.board.minTraceToPadEdgeClearance,
    minTraceToPadEdgeClearance: map.board.minTraceToPadEdgeClearance,
    minViaEdgeToPadEdgeClearance: map.board.minViaEdgeToPadEdgeClearance,
    minViaHoleEdgeToViaHoleEdgeClearance: map.board.minViaHoleEdgeToViaHoleEdgeClearance,
    minPadEdgeToPadEdgeClearance: map.board.minPadEdgeToPadEdgeClearance,
    minBoardEdgeClearance: map.board.minBoardEdgeClearance,
    allowViaInPad: map.board.allowViaInPad,
    obstacles,
    connections,
    buses: map.buses,
    differentialPairs: map.differentialPairs.map((pair) => ({
      name: pair.name,
      connectionNames: pair.connectionNames,
    })),
    bounds,
    outline,
    metadata: {
      datasetName: "dataset-srj29-ddr3-bga-pairs",
      sampleType: map.sampleType,
      referenceDesign: {
        ...map.referenceDesign,
        connectionMapFile: manifestEntry.mapFile,
        directConnectionCount: connections.length,
        sourceDirectConnectionCount: map.connections.length,
        endpointMapSha256: map.endpointMapSha256,
      },
      memory: {
        componentId: map.memory.componentId,
        reference: map.memory.reference,
        partNumber: map.memory.partNumber,
        footprint: map.memory.footprint,
        padCount: map.memory.padCount,
        pitch: map.memory.pitch,
        padFieldWidth: map.memory.padFieldWidth,
        padFieldHeight: map.memory.padFieldHeight,
        technology: map.memory.technology,
        signalPinCount: connections.length,
        rotation: map.memory.rotation,
        bodyWidth: map.memory.bodyWidth,
        bodyHeight: map.memory.bodyHeight,
      },
      controller: {
        componentId: map.controller.componentId,
        reference: map.controller.reference,
        partNumber: map.controller.partNumber,
        footprint: map.controller.footprint,
        padCount: map.controller.padCount,
        pitch: map.controller.pitch,
        padFieldWidth: map.controller.padFieldWidth,
        padFieldHeight: map.controller.padFieldHeight,
        rotation: map.controller.rotation,
        bodyWidth: map.controller.bodyWidth,
        bodyHeight: map.controller.bodyHeight,
      },
      placement: {
        controllerCenter: map.controller.center,
        memoryCenter: map.memory.center,
        componentGap,
        componentGapDefinition: "minimum horizontal clearance between the published physical pad-field edges",
        boardWidth: map.board.width,
        boardHeight: map.board.height,
      },
      fanout: map.fanout,
      signalGroupByConnection,
      referenceNetByConnection: Object.fromEntries(map.connections.map((connection) => [connection.net, connection.net])),
      endpointBallsByConnection: Object.fromEntries(map.connections.map((connection) => [connection.net, {
        memoryBall: connection.memory.ball,
        memorySignal: connection.memory.signal,
        controllerBall: connection.controller.ball,
        controllerSignal: connection.controller.signal,
        referenceNet: connection.net,
        sourcePath: connection.sourcePath,
      }])),
    },
  }
}

function createSample(index, mapRecord) {
  return mapRecord.map.sampleType === "published-tscircuit-repro"
    ? createPublishedReproSample(index, mapRecord)
    : createDdr3Sample(index, mapRecord)
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
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
  const memory = sample.metadata.memory ?? sample.metadata.ddr3
  const pads = sample.obstacles.map((obstacle) => {
    const fill = obstacle.componentId === memory.componentId ? "#f5a742" : "#4d8cc9"
    const width = Math.max(1.6, obstacle.width * scale)
    const height = Math.max(1.6, obstacle.height * scale)
    return `<rect x="${sx(obstacle.center.x) - width / 2}" y="${sy(obstacle.center.y) - height / 2}" width="${width}" height="${height}" rx="${Math.min(width, height) * 0.22}" fill="${fill}" stroke="#0b1015" stroke-width="0.35"/>`
  }).join("")
  const componentLabel = (componentId, color, label) => {
    const componentPads = sample.obstacles.filter((obstacle) => obstacle.componentId === componentId)
    const bounds = getPadBounds(componentPads.map((pad) => ({ ...pad.center, width: pad.width, height: pad.height })))
    return `<text x="${sx((bounds.minX + bounds.maxX) / 2)}" y="${Math.min(svgHeight - 19, sy(bounds.minY) + 25)}" text-anchor="middle" fill="${color}" font-family="ui-monospace, monospace" font-size="12" font-weight="700">${escapeXml(label)}</text>`
  }
  const labels = showComponentLabels
    ? `${componentLabel(memory.componentId, "#ffc977", `${memory.reference} · ${memory.partNumber} · ${memory.padCount} balls`)}${componentLabel(sample.metadata.controller.componentId, "#88b9eb", `${sample.metadata.controller.reference} · ${sample.metadata.controller.partNumber} · ${sample.metadata.controller.padCount} balls`)}`
    : ""
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="#0d1218"/>
  <rect x="${sx(minX)}" y="${sy(maxY)}" width="${boardWidth * scale}" height="${boardHeight * scale}" rx="8" fill="#13251f" stroke="#4f806c" stroke-width="2"/>
  <g>${lines}</g><g>${pads}</g>${labels}
  <text x="28" y="36" fill="#eef5fb" font-family="ui-sans-serif, system-ui" font-size="17" font-weight="700">${sample.id} · ${sample.connections.length} real board nets · ${sample.layerCount} layers</text>
  <text x="28" y="57" fill="#9fb0bf" font-family="ui-sans-serif, system-ui" font-size="12">${escapeXml(sample.metadata.referenceDesign.board)} · ${sample.metadata.placement.componentGap} mm gap · unrouted</text>
</svg>`
}

function makeContactSheet(samples) {
  const cellWidth = 420
  const cellHeight = 270
  const cols = 4
  const rows = Math.ceil(samples.length / cols)
  const cells = samples.map((sample, index) => {
    const svg = makeSampleSvg(sample, cellWidth, cellHeight, false)
      .replace(/^<\?xml[^>]*>\s*/, "")
      .replace(/^<svg[^>]*>/, "")
      .replace(/<\/svg>$/, "")
    return `<g transform="translate(${(index % cols) * cellWidth},${Math.floor(index / cols) * cellHeight})">${svg}</g>`
  }).join("")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth * cols}" height="${cellHeight * rows}" viewBox="0 0 ${cellWidth * cols} ${cellHeight * rows}">${cells}</svg>`
}

function makeIndex(samples) {
  const lines = ["\"use strict\"", ""]
  for (const sample of samples) lines.push(`exports.${sample.id} = require("./samples/${sample.id}.json")`)
  lines.push("", "exports.dataset = {")
  for (const sample of samples) lines.push(`  ${sample.id}: exports.${sample.id},`)
  lines.push("}", "", "exports.default = exports.dataset", "")
  return lines.join("\n")
}

function makeConnectionMapsMarkdown(samples) {
  const rows = samples.map((sample) => {
    const reference = sample.metadata.referenceDesign
    const memory = sample.metadata.memory ?? sample.metadata.ddr3
    return `| ${sample.id} | [${reference.board}](${reference.sourceUrl}) | ${memory.reference} ${memory.partNumber} | ${sample.metadata.controller.reference} ${sample.metadata.controller.partNumber} | ${sample.connections.length} | ${reference.sourceDirectConnectionCount} | \`${reference.endpointMapSha256.slice(0, 12)}\` | [map](${reference.connectionMapFile}) |`
  }).join("\n")
  return `# Memory-to-BGA reference maps

Every sample uses a different primary source and a unique canonical memory-ball-to-controller-ball endpoint hash. KiCad-derived maps preserve the committed package pad populations and exact board nets; sample021 preserves the published tscircuit AM62L32-to-LPDDR4 reproduction at package version 1.0.5. If a reference uses one series resistor between the two chips, the benchmark collapses that resistor while recording it in each connection's \`sourcePath\`.

| Sample | Primary board source | Memory | Controller / FPGA / SoC | Routed nets | Source pairs | Endpoint hash | Machine map |
|---|---|---|---|---:|---:|---|---|
${rows}

Power, ground, VREF, ZQ, decoupling, and termination-only branches are outside this two-BGA routing benchmark.
`
}

function makeTypes(samples) {
  const exports = samples.map((sample) => `export const ${sample.id}: SimpleRouteJson`).join("\n")
  return `export interface SimpleRoutePoint { x: number; y: number; layer?: string; layers?: string[]; pointId?: string; pcb_port_id?: string }
export interface SimpleRouteConnection { name: string; rootConnectionName?: string; netConnectionName?: string; nominalTraceWidth?: number; pointsToConnect: SimpleRoutePoint[] }
export interface SimpleRouteObstacle { obstacleId?: string; componentId?: string; ballName?: string; vendorPinName?: string; type: "rect"; shape?: "rect" | "circle"; layers: string[]; center: { x: number; y: number }; width: number; height: number; connectedTo: string[] }
export interface SimpleRouteJson { id: string; title: string; description: string; layerCount: number; minTraceWidth: number; nominalTraceWidth?: number; minViaHoleDiameter?: number; minViaPadDiameter?: number; defaultObstacleMargin?: number; minTraceToPadEdgeClearance?: number; minViaEdgeToPadEdgeClearance?: number; allowViaInPad?: boolean; obstacles: SimpleRouteObstacle[]; connections: SimpleRouteConnection[]; buses?: unknown[]; differentialPairs?: unknown[]; bounds: { minX: number; maxX: number; minY: number; maxY: number }; outline?: Array<{ x: number; y: number }>; metadata: Record<string, unknown> }

${exports}

export const dataset: Record<string, SimpleRouteJson>
declare const defaultDataset: Record<string, SimpleRouteJson>
export default defaultDataset
`
}

await mkdir(samplesDir, { recursive: true })
await mkdir(previewsDir, { recursive: true })
const samples = maps.map((mapRecord, index) => createSample(index + 1, mapRecord))
for (const sample of samples) {
  await writeFile(path.join(samplesDir, `${sample.id}.json`), `${JSON.stringify(sample, null, 2)}\n`)
  await writeFile(path.join(previewsDir, `${sample.id}.svg`), makeSampleSvg(sample))
}
const manifest = {
  datasetName: "dataset-srj29-ddr3-bga-pairs",
  sampleCount: samples.length,
  purpose: "Twenty spacious DDR3-to-BGA references plus one exact published AM62L32-to-LPDDR4 breakout reproduction",
  totalReferenceEndpointPairs: maps.reduce((sum, mapRecord) => sum + mapRecord.map.connections.length, 0),
  totalRoutedEndpointPairs: samples.reduce((sum, sample) => sum + sample.connections.length, 0),
  referenceManifestFile: "reference/reference-manifest.json",
  samples: samples.map((sample) => {
    const memory = sample.metadata.memory ?? sample.metadata.ddr3
    return {
      id: sample.id,
      title: sample.title,
      referenceBoard: sample.metadata.referenceDesign.board,
      referenceRepository: sample.metadata.referenceDesign.repository,
      referenceSourceUrl: sample.metadata.referenceDesign.sourceUrl,
      endpointMapSha256: sample.metadata.referenceDesign.endpointMapSha256,
      connectionMapFile: sample.metadata.referenceDesign.connectionMapFile,
      layerCount: sample.layerCount,
      connectionCount: sample.connections.length,
      referenceConnectionCount: sample.metadata.referenceDesign.sourceDirectConnectionCount,
      obstacleCount: sample.obstacles.length,
      memoryPadCount: memory.padCount,
      memoryPartNumber: memory.partNumber,
      memoryTechnology: memory.technology,
      ddr3PadCount: sample.metadata.ddr3?.padCount,
      ddr3PartNumber: sample.metadata.ddr3?.partNumber,
      controllerPadCount: sample.metadata.controller.padCount,
      controllerPartNumber: sample.metadata.controller.partNumber,
      componentGap: sample.metadata.placement.componentGap,
      rotation: memory.rotation,
      bounds: sample.bounds,
    }
  }),
}
const connectionMapsMarkdown = makeConnectionMapsMarkdown(samples)
await writeFile(path.join(repoRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(path.join(repoRoot, "index.js"), makeIndex(samples))
await writeFile(path.join(repoRoot, "index.d.ts"), makeTypes(samples))
await writeFile(path.join(repoRoot, "CONNECTION_MAP.md"), connectionMapsMarkdown)
await writeFile(path.join(repoRoot, "CONNECTION_MAPS.md"), connectionMapsMarkdown)
await writeFile(path.join(previewsDir, "contact-sheet.svg"), makeContactSheet(samples))
console.log(`Generated ${samples.length} memory-to-BGA SRJ samples`)
