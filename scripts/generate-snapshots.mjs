import { readFile, readdir, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const samplesDir = path.join(repoRoot, "samples")
const snapshotsDir = path.join(repoRoot, "snapshots")

const safeId = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

function getComponentBounds(pads) {
  const minX = Math.min(...pads.map((pad) => pad.center.x - pad.width / 2))
  const maxX = Math.max(...pads.map((pad) => pad.center.x + pad.width / 2))
  const minY = Math.min(...pads.map((pad) => pad.center.y - pad.height / 2))
  const maxY = Math.max(...pads.map((pad) => pad.center.y + pad.height / 2))
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    width: maxX - minX,
    height: maxY - minY,
  }
}

function convertSampleToCircuitJson(sample) {
  const circuitJson = []
  const boardWidth = sample.bounds.maxX - sample.bounds.minX
  const boardHeight = sample.bounds.maxY - sample.bounds.minY
  const boardCenter = {
    x: (sample.bounds.minX + sample.bounds.maxX) / 2,
    y: (sample.bounds.minY + sample.bounds.maxY) / 2,
  }

  circuitJson.push({
    type: "pcb_board",
    pcb_board_id: `pcb_board_${sample.id}`,
    center: boardCenter,
    width: boardWidth,
    height: boardHeight,
    outline: sample.outline,
    thickness: 1.6,
    num_layers: sample.layerCount,
  })

  const components = [
    {
      componentId: "ddr3_bga",
      sourceComponentId: "source_component_ddr3",
      pcbComponentId: "pcb_component_ddr3",
      name: "U12",
      label: `${sample.metadata.ddr3.partNumber} DDR3L x${sample.metadata.ddr3.dataWidth}`,
      bodyWidth: sample.metadata.ddr3.bodyWidth,
      bodyHeight: sample.metadata.ddr3.bodyHeight,
    },
    {
      componentId: "controller_bga",
      sourceComponentId: "source_component_controller",
      pcbComponentId: "pcb_component_controller",
      name: "U5",
      label: `${sample.metadata.controller.partNumber} ${sample.metadata.controller.package}`,
    },
  ]

  for (const component of components) {
    const pads = sample.obstacles.filter((obstacle) => obstacle.componentId === component.componentId)
    const padBounds = getComponentBounds(pads)
    const width = component.bodyWidth ?? padBounds.width + sample.metadata.controller.pitch
    const height = component.bodyHeight ?? padBounds.height + sample.metadata.controller.pitch
    circuitJson.push(
      {
        type: "source_component",
        source_component_id: component.sourceComponentId,
        name: component.name,
        ftype: "simple_chip",
      },
      {
        type: "pcb_component",
        pcb_component_id: component.pcbComponentId,
        source_component_id: component.sourceComponentId,
        center: padBounds.center,
        width,
        height,
        rotation: 0,
        layer: "top",
      },
      {
        type: "pcb_silkscreen_rect",
        pcb_silkscreen_rect_id: `pcb_silkscreen_rect_${safeId(component.name)}`,
        pcb_component_id: component.pcbComponentId,
        center: padBounds.center,
        width,
        height,
        stroke_width: 0.15,
        layer: "top",
      },
      {
        type: "pcb_silkscreen_text",
        pcb_silkscreen_text_id: `pcb_silkscreen_text_${safeId(component.name)}`,
        pcb_component_id: component.pcbComponentId,
        anchor_position: { x: padBounds.center.x, y: padBounds.center.y - height / 2 - 0.8 },
        anchor_alignment: "top_center",
        text: `${component.name} ${component.label}`,
        font_size: 0.55,
        stroke_width: 0.08,
        layer: "top",
      },
    )
  }

  const connectionNames = new Set(sample.connections.map((connection) => connection.name))
  const sourcePortsByConnection = new Map()

  for (const obstacle of sample.obstacles) {
    const isDdr3 = obstacle.componentId === "ddr3_bga"
    const componentPrefix = isDdr3 ? "ddr3" : "controller"
    const sourceComponentId = `source_component_${componentPrefix}`
    const pcbComponentId = `pcb_component_${componentPrefix}`
    const smtpadId = obstacle.obstacleId
    const connectionName = obstacle.connectedTo.find((value) => connectionNames.has(value))
    const pcbPortId = connectionName ? `pcb_port_${componentPrefix}_${safeId(connectionName)}` : undefined
    circuitJson.push({
      type: "pcb_smtpad",
      pcb_smtpad_id: smtpadId,
      pcb_component_id: pcbComponentId,
      shape: "rect",
      x: obstacle.center.x,
      y: obstacle.center.y,
      width: obstacle.width,
      height: obstacle.height,
      layer: "top",
      pcb_port_id: pcbPortId,
      port_hints: obstacle.ballName ? [obstacle.ballName] : undefined,
    })

    if (!connectionName) continue
    const sourcePortId = `source_port_${componentPrefix}_${safeId(connectionName)}`
    circuitJson.push(
      {
        type: "source_port",
        source_port_id: sourcePortId,
        source_component_id: sourceComponentId,
        name: connectionName,
        pin_number: obstacle.ballName,
        pcb_port_id: pcbPortId,
      },
      {
        type: "pcb_port",
        pcb_port_id: pcbPortId,
        pcb_component_id: pcbComponentId,
        pcb_smtpad_id: smtpadId,
        source_port_id: sourcePortId,
        x: obstacle.center.x,
        y: obstacle.center.y,
        layers: ["top"],
      },
    )
    if (!sourcePortsByConnection.has(connectionName)) sourcePortsByConnection.set(connectionName, [])
    sourcePortsByConnection.get(connectionName).push(sourcePortId)
  }

  for (const connection of sample.connections) {
    const connectedSourcePortIds = sourcePortsByConnection.get(connection.name) ?? []
    if (connectedSourcePortIds.length !== 2) {
      throw new Error(`${sample.id}: ${connection.name} resolved to ${connectedSourcePortIds.length} source ports`)
    }
    circuitJson.push({
      type: "source_trace",
      source_trace_id: `source_trace_${safeId(connection.name)}`,
      connected_source_port_ids: connectedSourcePortIds,
      connected_source_net_ids: [],
    })
  }

  return circuitJson
}

await mkdir(snapshotsDir, { recursive: true })
const sampleFiles = (await readdir(samplesDir)).filter((file) => /^sample\d{3}\.json$/.test(file)).sort()

for (const file of sampleFiles) {
  const sample = JSON.parse(await readFile(path.join(samplesDir, file), "utf8"))
  const circuitJson = convertSampleToCircuitJson(sample)
  const svg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 1200,
    height: 700,
    matchBoardAspectRatio: true,
    backgroundColor: "#0d1218",
    drawPaddingOutsideBoard: true,
    showSolderMask: true,
    showPcbNotes: true,
    shouldDrawRatsNest: true,
    includeVersion: true,
    colorOverrides: {
      boardOutline: "#68a68b",
      substrate: "#15352b",
      silkscreen: { top: "#f2eee5" },
      copper: { top: "#e9a23b" },
    },
  })
  const outputPath = path.join(snapshotsDir, file.replace(/\.json$/, ".svg"))
  await writeFile(outputPath, `${svg}\n`)
}

console.log(`Generated ${sampleFiles.length} circuit-to-svg PCB snapshots`)
