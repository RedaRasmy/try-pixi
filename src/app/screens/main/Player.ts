import { animate } from "motion"
import { Container, Graphics } from "pixi.js"

import type { Board } from "./Board"

export class Player extends Container {
    public col: number
    public row: number
    private board: Board
    private moving = false

    constructor(board: Board, col = 0, row = 0) {
        super()
        this.board = board
        this.col = col
        this.row = row

        // Shadow on the ground
        const shadow = new Graphics()
            .ellipse(0, 0, 22, 10)
            .fill({ color: 0x000000, alpha: 0.3 })
        // Body
        const body = new Graphics()
            .roundRect(-14, -48, 28, 40, 8)
            .fill(0x3b82f6)
        // Head
        const head = new Graphics().circle(0, -58, 13).fill(0xffd8b0)
        // Eyes
        const eyes = new Graphics()
            .circle(-5, -60, 2)
            .fill(0x000000)
            .circle(5, -60, 2)
            .fill(0x000000)

        this.addChild(shadow, body, head, eyes)

        const p = board.gridToScreen(col, row)
        this.x = p.x
        this.y = p.y
    }

    /** Move one tile with a short animation */
    private async stepTo(col: number, row: number) {
        const from = { x: this.x, y: this.y }
        const to = this.board.gridToScreen(col, row)

        await animate(0, 1, {
            duration: 0.18,
            ease: "linear",
            onUpdate: (t) => {
                this.x = from.x + (to.x - from.x) * t
                this.y = from.y + (to.y - from.y) * t
            },
        })

        this.col = col
        this.row = row
    }

    /** Move one tile in a direction (used by the keyboard) */
    public async move(dCol: number, dRow: number) {
        if (this.moving) return
        const col = this.col + dCol
        const row = this.row + dRow
        if (!this.board.isInside(col, row)) return

        this.moving = true
        await this.stepTo(col, row)
        this.moving = false
    }

    /** Walk to any tile (used by clicking): first along columns, then rows */
    public async walkTo(targetCol: number, targetRow: number) {
        if (this.moving) return
        this.moving = true

        while (this.col !== targetCol) {
            await this.stepTo(
                this.col + Math.sign(targetCol - this.col),
                this.row,
            )
        }
        while (this.row !== targetRow) {
            await this.stepTo(
                this.col,
                this.row + Math.sign(targetRow - this.row),
            )
        }

        this.moving = false
    }
}
