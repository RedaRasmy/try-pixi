import { Container, Graphics, Polygon } from "pixi.js"

const TILE_W = 128
const TILE_H = 64

export class Board extends Container {
    public readonly cols: number
    public readonly rows: number

    /** Called when a tile is clicked */
    public onTileTap?: (col: number, row: number) => void

    constructor(cols = 8, rows = 8) {
        super()
        this.cols = cols
        this.rows = rows
        this.build()
    }

    /** Grid position -> screen position (inside the board) */
    public gridToScreen(col: number, row: number) {
        return {
            x: ((col - row) * TILE_W) / 2,
            y: ((col + row) * TILE_H) / 2,
        }
    }

    /** Is this tile inside the board? */
    public isInside(col: number, row: number) {
        return col >= 0 && row >= 0 && col < this.cols && row < this.rows
    }

    private build() {
        const points = [
            0,
            -TILE_H / 2,
            TILE_W / 2,
            0,
            0,
            TILE_H / 2,
            -TILE_W / 2,
            0,
        ]

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const color = (col + row) % 2 === 0 ? 0xe8e8e8 : 0xbfbfbf

                const tile = new Graphics()
                    .poly(points)
                    .fill(color)
                    .stroke({ width: 2, color: 0x000000, alpha: 0.3 })

                const pos = this.gridToScreen(col, row)
                tile.x = pos.x
                tile.y = pos.y

                tile.hitArea = new Polygon(points)
                tile.eventMode = "static"
                tile.cursor = "pointer"
                tile.on("pointerover", () => (tile.tint = 0xffd966))
                tile.on("pointerout", () => (tile.tint = 0xffffff))
                tile.on("pointertap", () => this.onTileTap?.(col, row))

                this.addChild(tile)
            }
        }

        this.y = -((this.cols + this.rows - 2) * TILE_H) / 4
    }
}
