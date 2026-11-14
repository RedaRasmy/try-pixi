import { animate } from "motion"
import { Container, Graphics, Text } from "pixi.js"
import type { Status } from "./Status"
import type { Board, Tile } from "./Board"
import type { Stats } from "./Stats"
import { sim, record } from "./Script"

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
    public readonly color: number

    public isGhost = false
    public readonly statuses = new Map<string, Status>()

    /** Natural sense radius (enemies with En). Statuses can raise it. */
    public baseSense = 0

    public get senseRadius() {
        return this.statusList().reduce(
            (m, s) => Math.max(m, s.sense ?? 0),
            this.baseSense,
        )
    }

    public canHit(target: Tile, range: { minRange: number; maxRange: number }) {
        return this.board.canHit(this, target, range)
    }

    public addStatus(status: Status) {
        this.statuses.set(status.id, status)
    }
    public removeStatus(id: string) {
        this.statuses.delete(id)
    }
    public hasStatus(id: string) {
        return this.statuses.has(id)
    }

    public hasNotStatus(id: string) {
        return !this.statuses.has(id)
    }

    public setGhost(on: boolean) {
        this.isGhost = on
        this.alpha = on ? 0.35 : 1
    }

    public heal(amount: number) {
        const healed = Math.min(amount, this.stats.maxHp - this.stats.hp)
        if (healed <= 0) return
        this.stats.hp += healed
        if (sim.dry) {
            record({ kind: "heal", target: this, amount: healed })
            return
        }
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
        this.color = options.color

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

    public startTurn() {
        this.stats.ap = this.stats.maxAp
    }

    public spendAp(amount: number) {
        this.stats.ap = Math.max(0, this.stats.ap - amount)
    }

    public async takeDamage(amount: number) {
        const dealt = Math.min(amount, this.stats.hp)
        this.stats.hp -= dealt
        if (sim.dry) return dealt

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

    /** Walk along a list of tiles, spending 1 AP per tile */
    public async followPath(path: Tile[]) {
        this.spendAp(path.length)
        await this.slide(path)
    }

    /** Move along tiles without spending AP (also used by pushes) */
    public async slide(path: Tile[]) {
        if (path.length === 0) return
        if (sim.dry) {
            const last = path[path.length - 1]
            this.col = last.col
            this.row = last.row
            return
        }
        for (const step of path) await this.stepTo(step)
    }

    /** A number that rises above the entity and fades out */
    public showFloatingText(content: string, color: number, size = 34, dy = 0) {
        const text = new Text({
            text: content,
            style: {
                fill: color,
                fontSize: size,
                fontWeight: "bold",
                stroke: { color: 0x000000, width: 5 },
            },
        })
        text.anchor.set(0.5)
        const startY = this.y - 100 - dy
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

    /** Save position, stats and statuses. Call the returned function to restore them. */
    public snapshot() {
        const { col, row } = this
        const stats = { ...this.stats }
        const statuses = [...this.statuses.values()].map((s) => ({ ...s }))
        return () => {
            this.col = col
            this.row = row
            Object.assign(this.stats, stats)
            this.statuses.clear()
            for (const s of statuses) this.statuses.set(s.id, { ...s })
            this.drawHp()
        }
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

    public drawHp() {
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

    /** Put the entity on a tile instantly */
    public place(tile: Tile) {
        this.col = tile.col
        this.row = tile.row
        const p = this.board.gridToScreen(tile.col, tile.row)
        this.position.set(p.x, p.y)
        this.zIndex = tile.col + tile.row
    }

    /** Clones override this to show their owner's statuses */
    public statusList(): Status[] {
        return [...this.statuses.values()]
    }

    public damageDealtMultiplier() {
        return this.statusList().reduce((m, s) => m * (s.dealt ?? 1), 1)
    }

    public damageTakenMultiplier() {
        return this.statusList().reduce((m, s) => m * (s.taken ?? 1), 1)
    }

    /** Remove "next attack" statuses. Returns their names. */
    public consumeAttackStatuses() {
        const used: string[] = []
        for (const s of this.statusList()) {
            if (!s.consumeOnAttack) continue
            this.statuses.delete(s.id)
            used.push(s.name)
        }
        return used
    }

    /** Called at the start of the owner's turn. Returns the names that expired. */
    public tickStatuses() {
        const expired: string[] = []
        for (const s of [...this.statuses.values()]) {
            if (s.turnsLeft === undefined) continue
            s.turnsLeft--
            if (s.turnsLeft <= 0) {
                this.statuses.delete(s.id)
                expired.push(s.name)
            }
        }
        return expired
    }
}
