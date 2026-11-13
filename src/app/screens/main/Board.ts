import { Container, Graphics, Polygon, Text } from "pixi.js"

export const TILE_W = 128
export const TILE_H = 64
const WALL_H = 30

export interface Tile {
    col: number
    row: number
}
export interface PathNode extends Tile {
    dist: number
    parent: PathNode | null
}
export type HighlightLayer = "zone" | "main" | "preview" | "hover"

const HW = TILE_W / 2
const HH = TILE_H / 2
const DIAMOND = [0, -HH, HW, 0, 0, HH, -HW, 0]
/** Diamond + the volume of a wall standing on it (used by the fog) */
const WALL_SHAPE = [
    0,
    -HH - WALL_H,
    HW,
    -WALL_H,
    HW,
    0,
    0,
    HH,
    -HW,
    0,
    -HW,
    -WALL_H,
]
const NEIGHBOURS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
]

export const tileKey = (t: Tile) => `${t.col},${t.row}`
export const manhattan = (a: Tile, b: Tile) =>
    Math.abs(a.col - b.col) + Math.abs(a.row - b.row)

export function buildPath(node: PathNode): Tile[] {
    const path: Tile[] = []
    let current: PathNode | null = node
    while (current && current.parent) {
        path.unshift({ col: current.col, row: current.row })
        current = current.parent
    }
    return path
}

const offset = (points: number[], x: number, y: number) =>
    points.map((v, i) => (i % 2 === 0 ? v + x : v + y))

export class Board extends Container {
    public readonly cols: number
    public readonly rows: number

    public onTileTap?: (tile: Tile) => void
    public onTileHover?: (tile: Tile | null) => void

    /** Entities and walls live here (sorted by depth) */
    public readonly entityLayer = new Container()

    private walls = new Set<string>()
    private tileLayer = new Container()
    private highlightLayers: Record<HighlightLayer, Container> = {
        zone: new Container(),
        main: new Container(),
        preview: new Container(),
        hover: new Container(),
    }
    private arrows = new Graphics()
    private labelLayer = new Container()
    private fogLayer = new Container()

    /** @param layout one string per row: '.' floor, '#' wall */
    constructor(layout: string[]) {
        super()
        this.rows = layout.length
        this.cols = layout[0].length

        layout.forEach((line, row) => {
            for (let col = 0; col < this.cols; col++) {
                if (line[col] === "#") this.walls.add(tileKey({ col, row }))
            }
        })

        this.labelLayer.eventMode = "none"
        this.entityLayer.sortableChildren = true
        this.entityLayer.eventMode = "none"
        this.arrows.eventMode = "none"
        this.fogLayer.eventMode = "none"
        for (const layer of Object.values(this.highlightLayers)) {
            layer.eventMode = "none"
        }

        this.addChild(
            this.tileLayer,
            this.highlightLayers.zone,
            this.highlightLayers.main,
            this.highlightLayers.preview,
            this.highlightLayers.hover,
            this.entityLayer,
            this.arrows,
            this.labelLayer,
            this.fogLayer,
        )
        this.build()
    }

    /** Is there a clear straight line between two tiles (no wall in between)? */
    public hasLineOfSight(a: Tile, b: Tile) {
        return this.rayClear(a, b) && this.rayClear(b, a)
    }

    /** In range and no wall in between */
    public canHit(
        from: Tile,
        to: Tile,
        range: { minRange: number; maxRange: number },
    ) {
        const d = manhattan(from, to)
        return (
            d >= range.minRange &&
            d <= range.maxRange &&
            this.hasLineOfSight(from, to)
        )
    }

    private rayClear(a: Tile, b: Tile) {
        const steps =
            Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row)) * 2
        for (let i = 1; i < steps; i++) {
            const t = i / steps
            const tile = {
                col: Math.round(a.col + (b.col - a.col) * t),
                row: Math.round(a.row + (b.row - a.row) * t),
            }
            const isEnd =
                (tile.col === a.col && tile.row === a.row) ||
                (tile.col === b.col && tile.row === b.row)
            if (!isEnd && this.isWall(tile)) return false
        }
        return true
    }

    /** Tiles in range, split into those you can hit and those hidden behind walls */
    public attackRange(from: Tile, min: number, max: number) {
        const clear: Tile[] = []
        const blocked: Tile[] = []
        for (const t of this.tilesInRange(from, min, max)) {
            ;(this.hasLineOfSight(from, t) ? clear : blocked).push(t)
        }
        return { clear, blocked }
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

    public isWall(tile: Tile) {
        return this.walls.has(tileKey(tile))
    }

    public tilesInRange(
        from: Tile,
        min: number,
        max: number,
        includeWalls = false,
    ) {
        const tiles: Tile[] = []
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const t = { col, row }
                const d = manhattan(from, t)
                if (d >= min && d <= max && (includeWalls || !this.isWall(t)))
                    tiles.push(t)
            }
        }
        return tiles
    }

    /**
     * BFS: tiles reachable within `maxSteps`. `isBlocked` tiles can't be entered.
     * Tiles where `canStop` is false can be walked through but aren't returned.
     */
    public getReachable(
        from: Tile,
        maxSteps: number,
        isBlocked: (tile: Tile) => boolean,
        canStop: (tile: Tile) => boolean = () => true,
    ) {
        const start: PathNode = {
            col: from.col,
            row: from.row,
            dist: 0,
            parent: null,
        }
        const seen = new Set<string>([tileKey(start)])
        const found = new Map<string, PathNode>([[tileKey(start), start]])
        const queue: PathNode[] = [start]

        while (queue.length > 0) {
            const current = queue.shift()!
            if (current.dist >= maxSteps) continue

            for (const [dc, dr] of NEIGHBOURS) {
                const next = { col: current.col + dc, row: current.row + dr }
                if (!this.isInside(next.col, next.row) || this.isWall(next))
                    continue
                const key = tileKey(next)
                if (seen.has(key) || isBlocked(next)) continue
                seen.add(key)

                const node: PathNode = {
                    ...next,
                    dist: current.dist + 1,
                    parent: current,
                }
                if (canStop(next)) found.set(key, node)
                queue.push(node)
            }
        }
        return found
    }

    // ---------- Highlights ----------

    public highlight(
        layer: HighlightLayer,
        tiles: Tile[],
        color: number,
        alpha = 0.45,
    ) {
        this.clearHighlight(layer)
        this.addHighlight(layer, tiles, color, alpha)
    }

    public addHighlight(
        layer: HighlightLayer,
        tiles: Tile[],
        color: number,
        alpha = 0.45,
    ) {
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

    // ---------- Fog ----------

    /** Cover everything except `visible` in darkness. null removes the fog. */
    public setFog(visible: Tile[] | null) {
        for (const child of this.fogLayer.removeChildren()) child.destroy()
        if (!visible) return

        const keep = new Set(visible.map(tileKey))
        const g = new Graphics()
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                if (keep.has(tileKey({ col, row }))) continue
                const pos = this.gridToScreen(col, row)
                const shape = this.isWall({ col, row }) ? WALL_SHAPE : DIAMOND
                g.poly(offset(shape, pos.x, pos.y)).fill({
                    color: 0x020617,
                    alpha: 0.95,
                })
            }
        }
        this.fogLayer.addChild(g)
    }

    // ---------- Arrows and tags ----------

    public clearArrows() {
        this.arrows.clear()
        for (const child of this.labelLayer.removeChildren())
            child.destroy({ children: true })
    }

    /** Arrow along the ground, from `start` through every tile of `path` */
    public drawPathArrow(start: Tile, path: Tile[], color: number) {
        if (path.length === 0) return
        const HEAD = 26
        const pts = [start, ...path].map((t) => this.center(t, 4))
        const tip = pts[pts.length - 1]
        const dir = this.direction(pts[pts.length - 2], tip)

        // The line stops at the base of the head, so the head sits fully in front
        const end = {
            x: tip.x - dir.x * HEAD * 0.7,
            y: tip.y - dir.y * HEAD * 0.7,
        }
        this.strokeLine([...pts.slice(0, -1), end], color, 9)
        this.arrowHead(tip, dir, color, HEAD)
    }

    /** Curved arrow flying at chest height from one tile to another */
    public drawAttackArrow(from: Tile, to: Tile, color: number) {
        const HEAD = 26
        const a = this.center(from, 50)
        const b = this.center(to, 50)
        const lift = Math.min(90, 20 + Math.hypot(b.x - a.x, b.y - a.y) * 0.25)
        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - lift }
        const dir = this.direction(c, b)
        const end = { x: b.x - dir.x * HEAD * 0.7, y: b.y - dir.y * HEAD * 0.7 }

        for (const [width, col, alpha] of [
            [10, 0x000000, 0.45],
            [6, color, 0.95],
        ] as const) {
            this.arrows
                .moveTo(a.x, a.y)
                .quadraticCurveTo(c.x, c.y, end.x, end.y)
                .stroke({ width, color: col, alpha, cap: "round" })
        }
        this.arrowHead(b, dir, color, HEAD)
    }

    /** A small pill of text floating over a tile (damage, order...) */
    public addTag(tile: Tile, text: string, color: number, lift = 70) {
        const label = new Text({
            text,
            style: {
                fill: 0xffffff,
                fontSize: 17,
                fontWeight: "bold",
                stroke: { color: 0x000000, width: 3 },
            },
        })
        label.anchor.set(0.5)
        const w = label.width + 18
        const h = label.height + 6
        const bg = new Graphics()
            .roundRect(-w / 2, -h / 2, w, h, h / 2)
            .fill({ color, alpha: 0.95 })
            .stroke({ width: 2, color: 0x000000, alpha: 0.5 })

        const tag = new Container()
        tag.addChild(bg, label)
        const p = this.center(tile, lift)
        tag.position.set(p.x, p.y)
        this.labelLayer.addChild(tag)
    }

    private center(t: Tile, lift = 0) {
        const p = this.gridToScreen(t.col, t.row)
        return { x: p.x, y: p.y - lift }
    }

    private direction(
        a: { x: number; y: number },
        b: { x: number; y: number },
    ) {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
        return { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    }

    private strokeLine(
        points: { x: number; y: number }[],
        color: number,
        width: number,
    ) {
        for (const [w, col, alpha] of [
            [width + 4, 0x000000, 0.45],
            [width, color, 0.95],
        ] as const) {
            this.arrows.moveTo(points[0].x, points[0].y)
            for (let i = 1; i < points.length; i++)
                this.arrows.lineTo(points[i].x, points[i].y)
            this.arrows.stroke({
                width: w,
                color: col,
                alpha,
                cap: "round",
                join: "round",
            })
        }
    }

    /** Triangle whose tip is exactly at `tip`, pointing along `dir` */
    private arrowHead(
        tip: { x: number; y: number },
        dir: { x: number; y: number },
        color: number,
        size: number,
    ) {
        const base = { x: tip.x - dir.x * size, y: tip.y - dir.y * size }
        const nx = -dir.y * size * 0.55
        const ny = dir.x * size * 0.55
        this.arrows
            .poly([
                tip.x,
                tip.y,
                base.x + nx,
                base.y + ny,
                base.x - nx,
                base.y - ny,
            ])
            .fill({ color, alpha: 0.98 })
            .stroke({ width: 3, color: 0x000000, alpha: 0.45, join: "round" })
    }

    // ---------- Building ----------

    private build() {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const wall = this.isWall({ col, row })
                const color = (col + row) % 2 === 0 ? 0xe8e8e8 : 0xbfbfbf

                const tile = new Graphics()
                    .poly(DIAMOND)
                    .fill(color)
                    .stroke({ width: 2, color: 0x000000, alpha: 0.3 })

                const pos = this.gridToScreen(col, row)
                tile.position.set(pos.x, pos.y)

                tile.hitArea = new Polygon(DIAMOND)
                tile.eventMode = "static"
                tile.cursor = wall ? "default" : "pointer"
                tile.on("pointerover", () => {
                    if (!wall) tile.tint = 0xffd966
                    this.onTileHover?.({ col, row })
                })
                tile.on("pointerout", () => {
                    tile.tint = 0xffffff
                    this.onTileHover?.(null)
                })
                tile.on("pointertap", () => this.onTileTap?.({ col, row }))
                this.tileLayer.addChild(tile)

                if (wall) this.buildWall(col, row)
            }
        }

        this.y = -((this.cols + this.rows - 2) * TILE_H) / 4
    }

    /** An isometric block: left face, right face and top */
    private buildWall(col: number, row: number) {
        const h = WALL_H
        const outline = { width: 2, color: 0x000000, alpha: 0.35 }
        const wall = new Graphics()
            .poly([-HW, 0, 0, HH, 0, HH - h, -HW, -h])
            .fill(0x475569)
            .stroke(outline)
            .poly([0, HH, HW, 0, HW, -h, 0, HH - h])
            .fill(0x334155)
            .stroke(outline)
            .poly([0, -HH - h, HW, -h, 0, HH - h, -HW, -h])
            .fill(0x64748b)
            .stroke(outline)

        const pos = this.gridToScreen(col, row)
        wall.position.set(pos.x, pos.y)
        wall.zIndex = col + row
        this.entityLayer.addChild(wall)
    }
}
