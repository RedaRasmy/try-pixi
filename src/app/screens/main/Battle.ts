import type { Action } from "./Actions"
import { computeDamage } from "./Actions"
import type { Board, Tile } from "./Board"
import { buildPath, manhattan, tileKey } from "./Board"
import { Enemy } from "./Enemy"
import type { Entity } from "./Entity"
import { Player } from "./Player"

/** player = waiting for input, busy = an animation is playing */
export type Phase = "player" | "enemy" | "busy" | "over"

const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

export class Battle {
    public readonly board: Board
    public player!: Player
    public enemies: Enemy[] = []

    public phase: Phase = "player"
    public turn = 1
    public selectedAction: Action | null = null
    /** Entity currently under the mouse (shown in the stats panel) */
    public inspected: Entity | null = null

    /** UI listens to these */
    public onChange?: () => void
    public onGameOver?: (won: boolean) => void

    constructor(board: Board) {
        this.board = board
        board.onTileTap = (tile) => void this.handleTap(tile)
        board.onTileHover = (tile) => this.handleHover(tile)
        this.reset()
    }

    /** Start a fresh fight (also used by Replay) */
    public reset() {
        for (const e of this.everyone) e.destroy()

        this.player = new Player(this.board, 0, 0)
        this.enemies = [new Enemy(this.board, 5, 4)]
        for (const e of this.everyone) this.board.entityLayer.addChild(e)

        this.phase = "player"
        this.turn = 1
        this.selectedAction = null
        this.inspected = null
        this.player.startTurn()

        this.board.clearHighlight("hover")
        this.refreshHighlights()
        this.onChange?.()
    }

    // ---------- Player input ----------

    public selectAction(action: Action) {
        if (this.phase !== "player") return
        if (this.player.stats.ap < action.apCost) return

        // Clicking the selected action again cancels it
        this.selectedAction = this.selectedAction === action ? null : action
        this.refreshHighlights()
        this.onChange?.()
    }

    public async endTurn() {
        if (this.phase !== "player") return

        this.phase = "enemy"
        this.selectedAction = null
        this.board.clearHighlight("main")
        this.board.clearHighlight("hover")
        this.onChange?.()

        for (const enemy of this.enemies) {
            if (enemy.isDead) continue
            await wait(400)
            await enemy.takeTurn(this.isBlocked)
        }
        await wait(300)

        if (await this.checkEnd()) return

        this.turn++
        this.player.startTurn()
        this.phase = "player"
        this.refreshHighlights()
        this.onChange?.()
    }

    private async handleTap(tile: Tile) {
        if (this.phase !== "player") return
        if (this.selectedAction) await this.useAction(this.selectedAction, tile)
        else await this.tryMove(tile)
    }

    private async tryMove(tile: Tile) {
        const found = this.board.getReachable(
            this.player,
            this.player.stats.mp,
            this.isBlocked,
        )
        const node = found.get(tileKey(tile))
        if (!node || node.dist === 0) return

        this.phase = "busy"
        this.board.clearHighlight("main")
        this.board.clearHighlight("hover")
        await this.player.followPath(buildPath(node))
        await this.finishAction()
    }

    private async useAction(action: Action, tile: Tile) {
        const target = this.entityAt(tile)
        const distance = manhattan(this.player, tile)
        if (!target || target === this.player) return
        if (distance < action.minRange || distance > action.maxRange) return

        this.phase = "busy"
        this.board.clearHighlight("main")
        this.board.clearHighlight("hover")

        this.player.spendAp(action.apCost)
        this.onChange?.()
        await target.takeDamage(computeDamage(action, this.player.stats))
        await this.finishAction()
    }

    /** Common cleanup after the player moved or attacked */
    private async finishAction() {
        if (await this.checkEnd()) return

        this.phase = "player"
        if (
            this.selectedAction &&
            this.player.stats.ap < this.selectedAction.apCost
        ) {
            this.selectedAction = null
        }
        this.refreshHighlights()
        this.onChange?.()
    }

    // ---------- Hover ----------

    private handleHover(tile: Tile | null) {
        const entity = tile ? this.entityAt(tile) : undefined
        this.inspected = entity ?? null

        this.board.clearHighlight("hover")
        if (entity && this.phase === "player") {
            const isPlayer = entity === this.player

            // The player's movement area is already shown by the main layer
            // when no action is selected, so don't draw it twice
            if (!(isPlayer && !this.selectedAction)) {
                const mp = isPlayer ? entity.stats.mp : entity.stats.maxMp
                // Same blue as the default movement area; other entities are yellow
                const color = isPlayer ? 0x3b82f6 : 0xfacc15
                this.board.highlight(
                    "hover",
                    this.reachableTiles(entity, mp),
                    color,
                    0.45,
                )
            }
        }
        this.onChange?.()
    }

    // ---------- Helpers ----------

    private refreshHighlights() {
        this.board.clearHighlight("main")
        if (this.phase !== "player") return

        const action = this.selectedAction
        if (action) {
            const tiles = this.board.tilesInRange(
                this.player,
                action.minRange,
                action.maxRange,
            )
            this.board.highlight("main", tiles, 0xef4444)
        } else {
            const tiles = this.reachableTiles(this.player, this.player.stats.mp)
            this.board.highlight("main", tiles, 0x3b82f6)
        }
    }

    private reachableTiles(from: Tile, mp: number) {
        const found = this.board.getReachable(from, mp, this.isBlocked)
        return Array.from(found.values()).filter((n) => n.dist > 0)
    }

    private async checkEnd() {
        const won = this.enemies.every((e) => e.isDead)
        const lost = this.player.isDead
        if (!won && !lost) return false

        this.phase = "over"
        this.selectedAction = null
        this.board.clearHighlight("main")
        this.board.clearHighlight("hover")
        this.onChange?.()

        await wait(500)
        this.onGameOver?.(won)
        return true
    }

    private get everyone(): Entity[] {
        return this.player ? [this.player, ...this.enemies] : []
    }

    private entityAt(tile: Tile) {
        return this.everyone.find(
            (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
        )
    }

    private isBlocked = (tile: Tile) => !!this.entityAt(tile)
}
