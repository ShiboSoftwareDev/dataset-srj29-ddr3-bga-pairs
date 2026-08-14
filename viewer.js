const svg = document.querySelector("#board-view")
const list = document.querySelector("#sample-list")
const ratsnestToggle = document.querySelector("#ratsnest-toggle")
const SVG_NS = "http://www.w3.org/2000/svg"
const groupColors = {
  data: "#4ecdc4",
  strobe: "#ff6b6b",
  mask: "#ffd166",
  address: "#5f9df7",
  bank: "#9b7ede",
  command: "#f28e2b",
  clock: "#e15759",
  control: "#76b7b2",
}

const manifest = await fetch("manifest.json").then((response) => response.json())
let currentIndex = 0
let currentSample = null

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  return element
}

function addText(parent, text, x, y, attributes = {}) {
  const element = svgElement("text", { x, y, ...attributes })
  element.textContent = text
  parent.append(element)
}

function renderList() {
  list.replaceChildren(...manifest.samples.map((sample, index) => {
    const button = document.createElement("button")
    button.className = `sample-button${index === currentIndex ? " selected" : ""}`
    button.innerHTML = `
      <span class="sample-number">${sample.id.replace("sample", "#")}</span>
      <span class="sample-copy"><strong>${sample.referenceBoard}</strong><span>${sample.connectionCount} nets · ${sample.componentGap} mm gap</span></span>
      <span class="layer-pill">${sample.layerCount}L</span>`
    button.addEventListener("click", () => selectSample(index))
    return button
  }))
}

function renderStats(sample) {
  const items = [
    ["Connections", sample.connections.length],
    ["Copper layers", sample.layerCount],
    ["DDR3", `${sample.metadata.ddr3.partNumber} / ${sample.metadata.ddr3.padCount} balls`],
    ["Controller", `${sample.metadata.controller.partNumber} / ${sample.metadata.controller.padCount} balls`],
    ["BGA edge gap", `${sample.metadata.placement.componentGap} mm`],
  ]
  document.querySelector("#stats").innerHTML = items.map(([label, value]) =>
    `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`,
  ).join("")
}

function renderBoard(sample) {
  const viewWidth = 1200
  const viewHeight = 760
  const padding = 54
  const bounds = sample.bounds
  const boardWidth = bounds.maxX - bounds.minX
  const boardHeight = bounds.maxY - bounds.minY
  const scale = Math.min((viewWidth - padding * 2) / boardWidth, (viewHeight - padding * 2) / boardHeight)
  const x = (value) => padding + (value - bounds.minX) * scale
  const y = (value) => viewHeight - padding - (value - bounds.minY) * scale
  svg.setAttribute("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
  svg.replaceChildren()

  svg.append(svgElement("rect", {
    x: x(bounds.minX), y: y(bounds.maxY), width: boardWidth * scale, height: boardHeight * scale,
    rx: 10, fill: "#13251f", stroke: "#4f806c", "stroke-width": 2,
  }))

  const connectedNames = new Set(sample.connections.map((connection) => connection.name))
  if (ratsnestToggle.checked) {
    const group = svgElement("g", { opacity: 0.48 })
    for (const connection of sample.connections) {
      const [start, end] = connection.pointsToConnect
      group.append(svgElement("line", {
        x1: x(start.x), y1: y(start.y), x2: x(end.x), y2: y(end.y),
        stroke: groupColors[sample.metadata.signalGroupByConnection[connection.name]] ?? "#9fb0bf",
        "stroke-width": 1.2,
      }))
    }
    svg.append(group)
  }

  const pads = svgElement("g")
  for (const obstacle of sample.obstacles) {
    const connected = obstacle.connectedTo.some((name) => connectedNames.has(name))
    const fill = obstacle.componentId === "ddr3_bga" ? "#f5a742" : "#4d8cc9"
    const width = Math.max(3, obstacle.width * scale)
    const height = Math.max(3, obstacle.height * scale)
    pads.append(svgElement("rect", {
      x: x(obstacle.center.x) - width / 2,
      y: y(obstacle.center.y) - height / 2,
      width,
      height,
      rx: Math.min(width, height) * 0.24,
      fill,
      opacity: connected ? 1 : 0.52,
      stroke: connected ? "#f5f8fa" : "#071017",
      "stroke-width": connected ? 0.65 : 0.35,
    }))
  }
  svg.append(pads)

  const componentCenter = (componentId) => {
    const componentPads = sample.obstacles.filter((obstacle) => obstacle.componentId === componentId)
    return {
      x: componentPads.reduce((sum, pad) => sum + pad.center.x, 0) / componentPads.length,
      y: componentPads.reduce((sum, pad) => sum + pad.center.y, 0) / componentPads.length,
      minY: Math.min(...componentPads.map((pad) => pad.center.y - pad.height / 2)),
    }
  }
  const ddr3 = componentCenter("ddr3_bga")
  const controller = componentCenter("controller_bga")
  addText(svg, `${sample.metadata.ddr3.reference} · ${sample.metadata.ddr3.partNumber} · ${sample.metadata.ddr3.padCount} balls`, x(ddr3.x), y(ddr3.minY) + 35, {
    fill: "#ffc977", "font-size": 18, "font-weight": 750, "text-anchor": "middle",
  })
  addText(svg, `${sample.metadata.controller.reference} · ${sample.metadata.controller.partNumber} · ${sample.metadata.controller.padCount} balls`, x(controller.x), y(controller.minY) + 35, {
    fill: "#8fc3ee", "font-size": 18, "font-weight": 750, "text-anchor": "middle",
  })
}

async function selectSample(index) {
  currentIndex = index
  const info = manifest.samples[index]
  currentSample = await fetch(`samples/${info.id}.json`).then((response) => response.json())
  document.querySelector("#sample-id").textContent = info.id
  document.querySelector("#sample-title").textContent = currentSample.title
  document.querySelector("#sample-subtitle").textContent = `${currentSample.description} ${currentSample.metadata.placement.ddr3Side === "left" ? "DDR3 left" : "DDR3 right"}.`
  renderList()
  renderStats(currentSample)
  renderBoard(currentSample)
}

ratsnestToggle.addEventListener("change", () => currentSample && renderBoard(currentSample))
await selectSample(0)
