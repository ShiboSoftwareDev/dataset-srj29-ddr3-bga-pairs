export interface SimpleRoutePoint {
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

export const sample001: SimpleRouteJson
export const sample002: SimpleRouteJson
export const sample003: SimpleRouteJson
export const sample004: SimpleRouteJson
export const sample005: SimpleRouteJson
export const sample006: SimpleRouteJson
export const sample007: SimpleRouteJson
export const sample008: SimpleRouteJson
export const sample009: SimpleRouteJson
export const sample010: SimpleRouteJson
export const sample011: SimpleRouteJson
export const sample012: SimpleRouteJson
export const sample013: SimpleRouteJson
export const sample014: SimpleRouteJson
export const sample015: SimpleRouteJson
export const sample016: SimpleRouteJson
export const sample017: SimpleRouteJson
export const sample018: SimpleRouteJson
export const sample019: SimpleRouteJson
export const sample020: SimpleRouteJson

export const dataset: Record<string, SimpleRouteJson>
declare const defaultDataset: Record<string, SimpleRouteJson>
export default defaultDataset
