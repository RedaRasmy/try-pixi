import { Container, Graphics, Polygon } from "pixi.js"

export const TILE_W = 128
export const TILE_H = 64

export interface Tile {
    col: number
    row: number
}
export interface PathNode extends Tile {
    dist: number
    parent: PathNode | null
}
export type HighlightLayer = "main" | "hover"

const DIAMOND = [0, -TILE_H / 2, TILE_W / 2, 0, 0, TILE_H / 2, -TILE_W / 2, 0]
const NEIGHBOURS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
]

export const tileKey = (t: Tile) => `${t.col},${t.row}`
export const manhattan = (a: Tile, b: Tile) =>
    Math.abs(a.col - b.col) + Math.abs(a.row - b.row)

/** Turn a BFS node into the list of tiles to walk (start tile excluded) */
export function buildPath(node: PathNode): Tile[] {
    const path: Tile[] = []
    let current: PathNode | null = node
    while (current && current.parent) {
        path.unshift({ col: current.col, row: current.row })
        current = current.parent
    }
    return path
}

export class Board extends Container {
    public readonly cols: number
    public readonly rows: number

    public onTileTap?: (tile: Tile) => void
    /** Called with the hovered tile, or null when the pointer leaves it */
    public onTileHover?: (tile: Tile | null) => void

    /** Entities live here (sorted by depth) */
    public readonly entityLayer = new Container()

    private tileLayer = new Container()
    private highlightLayers: Record<HighlightLayer, Container> = {
        main: new Container(),
        hover: new Container(),
    }

    constructor(cols = 8, rows = 8) {
        super()
        this.cols = cols
        this.rows = rows

        this.entityLayer.sortableChildren = true
        // Only tiles receive pointer events; everything else lets them through
        this.entityLayer.eventMode = "none"
        this.highlightLayers.main.eventMode = "none"
        this.highlightLayers.hover.eventMode = "none"

        this.addChild(
            this.tileLayer,
            this.highlightLayers.main,
            this.highlightLayers.hover,
            this.entityLayer,
        )
        this.build()
    }

    public gridToScreen(col: number, row: number) {
        return {
            x: ((col - row) * TILE_W) / 2,
            y: ((col + row) * TILE_H) / 2,
        }
    }

    public isInside(col: number, row: number) {
        return col >= 0 && row >= 0 && col < this.cols && row < this.rows
    }

    /** All tiles whose distance from `from` is between min and max (inclusive) */
    public tilesInRange(from: Tile, min: number, max: number) {
        const tiles: Tile[] = []
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const d = manhattan(from, { col, row })
                if (d >= min && d <= max) tiles.push({ col, row })
            }
        }
        return tiles
    }

    /** BFS: every tile reachable within `maxSteps`, with its distance and parent */
    public getReachable(
        from: Tile,
        maxSteps: number,
        isBlocked: (tile: Tile) => boolean,
    ) {
        const start: PathNode = {
            col: from.col,
            row: from.row,
            dist: 0,
            parent: null,
        }
        const found = new Map<string, PathNode>([[tileKey(start), start]])
        const queue: PathNode[] = [start]

        while (queue.length > 0) {
            const current = queue.shift()!
            if (current.dist >= maxSteps) continue

            for (const [dc, dr] of NEIGHBOURS) {
                const next = { col: current.col + dc, row: current.row + dr }
                if (!this.isInside(next.col, next.row)) continue
                if (found.has(tileKey(next)) || isBlocked(next)) continue

                const node: PathNode = {
                    ...next,
                    dist: current.dist + 1,
                    parent: current,
                }
                found.set(tileKey(next), node)
                queue.push(node)
            }
        }
        return found
    }

    public highlight(
        layer: HighlightLayer,
        tiles: Tile[],
        color: number,
        alpha = 0.45,
    ) {
        this.clearHighlight(layer)
        for (const t of tiles) {
            const g = new Graphics().poly(DIAMOND).fill({ color, alpha })
            const pos = this.gridToScreen(t.col, t.row)
            g.position.set(pos.x, pos.y)
            this.highlightLayers[layer].addChild(g)
        }
    }

    public clearHighlight(layer: HighlightLayer) {
        const removed = this.highlightLayers[layer].removeChildren()
        for (const child of removed) child.destroy()
    }

    private build() {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const color = (col + row) % 2 === 0 ? 0xe8e8e8 : 0xbfbfbf

                const tile = new Graphics()
                    .poly(DIAMOND)
                    .fill(color)
                    .stroke({ width: 2, color: 0x000000, alpha: 0.3 })

                const pos = this.gridToScreen(col, row)
                tile.position.set(pos.x, pos.y)

                tile.hitArea = new Polygon(DIAMOND)
                tile.eventMode = "static"
                tile.cursor = "pointer"
                tile.on("pointerover", () => {
                    tile.tint = 0xffd966
                    this.onTileHover?.({ col, row })
                })
                tile.on("pointerout", () => {
                    tile.tint = 0xffffff
                    this.onTileHover?.(null)
                })
                tile.on("pointertap", () => this.onTileTap?.({ col, row }))

                this.tileLayer.addChild(tile)
            }
        }

        this.y = -((this.cols + this.rows - 2) * TILE_H) / 4
    }
}
