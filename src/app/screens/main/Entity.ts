import { animate } from "motion"
import { Container, Graphics, Text } from "pixi.js"
import type { Status } from "./Status"
import type { Board, Tile } from "./Board"
import type { Stats } from "./Stats"

export interface EntityOptions {
    name: string
    col: number
    row: number
    color: number
    stats: Stats
}

/** Anything that stands on the board and has stats */
export class Entity extends Container {
    public col: number
    public row: number
    public readonly displayName: string
    public readonly stats: Stats

    protected board: Board
    private visual = new Container()
    private hpBar = new Graphics()

    public isGhost = false
    public readonly statuses = new Map<string, Status>()

    public addStatus(status: Status) {
        this.statuses.set(status.id, status)
    }
    public removeStatus(id: string) {
        this.statuses.delete(id)
    }
    public hasStatus(id: string) {
        return this.statuses.has(id)
    }

    public setGhost(on: boolean) {
        this.isGhost = on
        this.alpha = on ? 0.35 : 1
    }

    public heal(amount: number) {
        const healed = Math.min(amount, this.stats.maxHp - this.stats.hp)
        if (healed <= 0) return
        this.stats.hp += healed
        this.drawHp()
        this.showFloatingText(`+${healed}`, 0x4ade80)
    }

    constructor(board: Board, options: EntityOptions) {
        super()
        this.board = board
        this.displayName = options.name
        this.stats = options.stats
        this.col = options.col
        this.row = options.row

        const shadow = new Graphics()
            .ellipse(0, 0, 22, 10)
            .fill({ color: 0x000000, alpha: 0.3 })
        const body = new Graphics()
            .roundRect(-14, -48, 28, 40, 8)
            .fill(options.color)
        const head = new Graphics().circle(0, -58, 13).fill(0xffd8b0)
        const eyes = new Graphics()
            .circle(-5, -60, 2)
            .fill(0x000000)
            .circle(5, -60, 2)
            .fill(0x000000)

        this.visual.addChild(body, head, eyes)
        this.hpBar.y = -84
        this.addChild(shadow, this.visual, this.hpBar)

        const pos = board.gridToScreen(this.col, this.row)
        this.position.set(pos.x, pos.y)
        this.zIndex = this.col + this.row
        this.drawHp()
    }

    public get isDead() {
        return this.stats.hp <= 0
    }

    /** Refill AP and MP */
    public startTurn() {
        this.stats.ap = this.stats.maxAp
        this.stats.mp = this.stats.maxMp
    }

    public spendAp(amount: number) {
        this.stats.ap = Math.max(0, this.stats.ap - amount)
    }

    public async takeDamage(amount: number) {
        const dealt = Math.min(amount, this.stats.hp)
        this.stats.hp -= dealt
        this.drawHp()

        this.showFloatingText(`-${amount}`, 0xff4d4d)

        await animate(0, 1, {
            duration: 0.25,
            onUpdate: (t) => {
                this.visual.x = Math.sin(t * Math.PI * 6) * 6 * (1 - t)
            },
        })
        this.visual.x = 0

        if (this.isDead) this.visible = false
        return dealt
    }

    /** A number that rises above the entity and fades out */
    private showFloatingText(content: string, color: number) {
        const text = new Text({
            text: content,
            style: {
                fill: color,
                fontSize: 34,
                fontWeight: "bold",
                stroke: { color: 0x000000, width: 5 },
            },
        })
        text.anchor.set(0.5)

        // It lives in the board's entity layer (not inside the entity), so it
        // stays visible even if the entity dies and gets hidden
        const startY = this.y - 100
        text.position.set(this.x, startY)
        text.zIndex = 10000
        this.board.entityLayer.addChild(text)

        void animate(0, 1, {
            duration: 0.9,
            ease: "easeOut",
            onUpdate: (t) => {
                if (text.destroyed) return
                text.y = startY - t * 45
                text.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
            },
            onComplete: () => {
                if (!text.destroyed) text.destroy()
            },
        })
    }

    /** Walk along a list of tiles, spending 1 MP per tile */
    public async followPath(path: Tile[]) {
        this.stats.mp = Math.max(0, this.stats.mp - path.length)
        for (const step of path) await this.stepTo(step)
    }

    private async stepTo(tile: Tile) {
        const from = { x: this.x, y: this.y }
        const to = this.board.gridToScreen(tile.col, tile.row)

        this.zIndex = Math.max(this.col + this.row, tile.col + tile.row)
        await animate(0, 1, {
            duration: 0.18,
            ease: "linear",
            onUpdate: (t) => {
                this.x = from.x + (to.x - from.x) * t
                this.y = from.y + (to.y - from.y) * t
            },
        })

        this.col = tile.col
        this.row = tile.row
        this.zIndex = tile.col + tile.row
    }

    private drawHp() {
        const w = 44
        const h = 6
        const ratio = this.stats.hp / this.stats.maxHp
        this.hpBar
            .clear()
            .rect(-w / 2, 0, w, h)
            .fill(0x222222)
            .rect(-w / 2, 0, w * ratio, h)
            .fill(0x4ade80)
    }
}
