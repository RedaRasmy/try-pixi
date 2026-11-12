import type { Ability } from "./Ability"
import type { Action, AttackAction } from "./Actions"
import { computeDamage } from "./Actions"
import type { Board, Tile } from "./Board"
import { buildPath, manhattan, tileKey } from "./Board"
import { Enemy } from "./Enemy"
import type { Entity } from "./Entity"
import { LaplaceDemon } from "./LaplaceDemon"
import { Player } from "./Player"

/** player = waiting for input, busy = an animation is playing */
export type Phase = "player" | "enemy" | "busy" | "over"

interface Forecast {
    moves: { entity: Entity; path: Tile[] }[]
    attackTiles: Tile[]
}

const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

export class Battle {
    public readonly board: Board
    public player!: Player
    public enemies: Enemy[] = []
    public abilities: Ability[] = []

    public phase: Phase = "player"
    public turn = 1
    public selectedAction: AttackAction | null = null
    public inspected: Entity | null = null

    /** UI listens to these */
    public onChange?: () => void
    public onGameOver?: (won: boolean) => void
    public onMessage?: (text: string) => void

    constructor(board: Board) {
        this.board = board
        board.onTileTap = (tile) => void this.handleTap(tile)
        board.onTileHover = (tile) => this.handleHover(tile)
        this.abilities = [new LaplaceDemon(this)]
        this.reset()
    }

    /** Every action the HUD should know about */
    public get allActions(): Action[] {
        return [
            ...this.player.actions,
            ...this.abilities.flatMap((a) => a.actions),
        ]
    }

    public say(text: string) {
        this.onMessage?.(text)
    }

    public reset() {
        for (const a of this.abilities) a.reset()
        if (this.player) this.player.destroy()
        for (const e of this.enemies) e.destroy()

        this.player = new Player(this.board, 0, 0)
        this.enemies = [new Enemy(this.board, 5, 4)]
        this.board.entityLayer.addChild(this.player)
        for (const e of this.enemies) this.board.entityLayer.addChild(e)

        this.phase = "player"
        this.turn = 1
        this.selectedAction = null
        this.inspected = null
        this.player.startTurn()

        this.board.clearHighlight("hover")
        this.refreshHighlights()
        this.onChange?.()
    }

    // ---------- Actions ----------

    public isVisible(action: Action) {
        return (
            !action.requiresStatus ||
            this.player.hasStatus(action.requiresStatus)
        )
    }

    /** Why the action can't be used right now, or null if it can */
    public unusableReason(action: Action): string | null {
        if (!this.isVisible(action)) return "Not available"
        if (this.player.stats.ap < action.apCost) return "Not enough AP"
        const own = action.unavailable?.()
        if (own) return own
        for (const a of this.abilities) {
            const reason = a.blocksAction(action)
            if (reason) return reason
        }
        return null
    }

    public selectAction(action: Action) {
        if (this.phase !== "player") return

        const reason = this.unusableReason(action)
        if (reason) {
            this.say(reason)
            return
        }

        if (action.kind === "instant") {
            this.player.spendAp(action.apCost)
            this.selectedAction = null
            action.run()
            for (const a of this.abilities) a.check()
        } else {
            // Clicking the selected action again cancels it
            this.selectedAction = this.selectedAction === action ? null : action
        }
        this.refreshHighlights()
        this.onChange?.()
    }

    public async endTurn() {
        if (this.phase !== "player") return

        this.phase = "enemy"
        this.selectedAction = null
        this.board.clearHighlight("main")
        this.board.clearHighlight("preview")
        this.board.clearHighlight("hover")
        this.onChange?.()

        // Clones and other ability entities act first
        for (const ability of this.abilities) {
            await wait(300)
            await ability.playTurn()
            ability.check()
        }

        for (const enemy of this.enemies) {
            if (enemy.isDead) continue
            await wait(400)

            const target = this.enemyTarget
            const plan = enemy.plan(target, target, (t) => this.isOccupied(t))
            await enemy.execute(plan)

            if (await this.checkEnd()) return
            for (const a of this.abilities) a.check()
            this.onChange?.()
        }
        await wait(300)

        if (await this.checkEnd()) return

        this.turn++
        this.player.startTurn()
        for (const a of this.abilities) a.onTurnStart()
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
            this.isBlockedForPlayer,
        )
        const node = found.get(tileKey(tile))
        if (!node || node.dist === 0) return

        this.phase = "busy"
        this.clearAllHighlights()
        await this.player.followPath(buildPath(node))
        await this.finishAction()
    }

    private async useAction(action: AttackAction, tile: Tile) {
        const target = this.enemies.find(
            (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
        )
        const distance = manhattan(this.player, tile)
        if (!target) return
        if (distance < action.minRange || distance > action.maxRange) return

        this.phase = "busy"
        this.clearAllHighlights()

        this.player.spendAp(action.apCost)
        this.onChange?.()
        const dealt = await target.takeDamage(
            computeDamage(action, this.player.stats),
        )
        for (const a of this.abilities) a.onDamageDealt(target, dealt)
        await this.finishAction()
    }

    private async finishAction() {
        if (await this.checkEnd()) return
        for (const a of this.abilities) a.check()

        this.phase = "player"
        if (this.selectedAction && this.unusableReason(this.selectedAction)) {
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
            if (!(isPlayer && !this.selectedAction)) {
                const mp = isPlayer ? entity.stats.mp : entity.stats.maxMp
                const color = isPlayer ? 0x3b82f6 : 0xfacc15
                this.board.highlight(
                    "hover",
                    this.reachableTiles(entity, mp, isPlayer),
                    color,
                    0.45,
                )
            }
        }
        this.onChange?.()
    }

    // ---------- Highlights and forecast ----------

    private clearAllHighlights() {
        this.board.clearHighlight("main")
        this.board.clearHighlight("preview")
        this.board.clearHighlight("hover")
    }

    private refreshHighlights() {
        this.board.clearHighlight("main")
        this.board.clearHighlight("preview")
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
            // Orange = walking there would break an active ability
            const tiles = this.reachableTiles(
                this.player,
                this.player.stats.mp,
                true,
            )
            const safe = tiles.filter((t) =>
                this.abilities.every((a) => a.isTileSafe(t)),
            )
            const unsafe = tiles.filter((t) => !safe.includes(t))
            this.board.highlight("main", safe, 0x3b82f6)
            this.board.addHighlight("main", unsafe, 0xf97316)
        }

        if (this.abilities.some((a) => a.showsForecast())) this.drawForecast()
    }

    private drawForecast() {
        const forecast = this.computeForecast()
        for (const move of forecast.moves) {
            const isEnemy = this.enemies.includes(move.entity as Enemy)
            this.board.addHighlight(
                "preview",
                move.path,
                isEnemy ? 0xec4899 : 0x22d3ee,
                0.6,
            )
        }
        this.board.addHighlight("preview", forecast.attackTiles, 0xdc2626, 0.8)
    }

    /** What will happen at the end of this turn, without doing it */
    private computeForecast(): Forecast {
        const moved = new Map<Entity, Tile>()
        const moves: Forecast["moves"] = []
        const attackTiles: Tile[] = []

        for (const ability of this.abilities) {
            for (const [entity, path] of ability.plannedMoves()) {
                if (path.length === 0) continue
                moves.push({ entity, path })
                moved.set(entity, path[path.length - 1])
            }
        }

        const target = this.enemyTarget
        const dest = moved.get(target) ?? target
        const targetTile = { col: dest.col, row: dest.row }

        for (const enemy of this.enemies) {
            if (enemy.isDead) continue
            const plan = enemy.plan(target, targetTile, (t) =>
                this.isOccupied(t, moved),
            )
            if (plan.path.length > 0) {
                moves.push({ entity: enemy, path: plan.path })
                moved.set(enemy, plan.path[plan.path.length - 1])
            }
            if (plan.attack) attackTiles.push(targetTile)
        }
        return { moves, attackTiles }
    }

    // ---------- Helpers ----------

    private reachableTiles(from: Tile, mp: number, forPlayer: boolean) {
        const blocked = forPlayer
            ? this.isBlockedForPlayer
            : (t: Tile) => this.isOccupied(t)
        const found = this.board.getReachable(from, mp, blocked)
        return Array.from(found.values()).filter((n) => n.dist > 0)
    }

    /** Who the enemies are going for: a decoy if there is one, else the player */
    private get enemyTarget(): Entity {
        for (const a of this.abilities) {
            const target = a.perceivedTarget()
            if (target) return target
        }
        return this.player
    }

    private async checkEnd() {
        const won = this.enemies.every((e) => e.isDead)
        const lost = this.player.isDead
        if (!won && !lost) return false

        this.phase = "over"
        this.selectedAction = null
        this.clearAllHighlights()
        this.onChange?.()

        await wait(500)
        this.onGameOver?.(won)
        return true
    }

    private get everyone(): Entity[] {
        if (!this.player) return []
        return [
            this.player,
            ...this.abilities.flatMap((a) => a.entities),
            ...this.enemies,
        ]
    }

    private entityAt(tile: Tile) {
        return this.everyone.find(
            (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
        )
    }

    /**
     * Is a tile taken, as seen by enemies and clones? The invisible player
     * doesn't count. `moved` simulates entities standing somewhere else.
     */
    public isOccupied(tile: Tile, moved?: Map<Entity, Tile>) {
        return this.everyone.some((e) => {
            if (e.isDead || e.isGhost) return false
            const at = moved?.get(e) ?? e
            return at.col === tile.col && at.row === tile.row
        })
    }

    /** The player is only stopped by enemies (clones can be walked through) */
    private isBlockedForPlayer = (tile: Tile) =>
        this.enemies.some(
            (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
        )
}
