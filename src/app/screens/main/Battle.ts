import type { Ability } from "./Ability"
import type { Action, AttackAction } from "./Actions"
import { computeDamage } from "./Actions"
import type { Board, Tile } from "./Board"
import { buildPath, manhattan, tileKey } from "./Board"
import { Enemy } from "./Enemy"
import type { Entity } from "./Entity"
import { LaplaceDemon } from "./LaplaceDemon"
import { ENEMY_STARTS, PLAYER_START } from "./Level"
import { Nen } from "./Nen"
import type { TurnPlan } from "./Planner"
import { Player } from "./Player"

/** player = waiting for input, busy = an animation is playing */
export type Phase = "player" | "enemy" | "busy" | "over"

interface ForecastAttack {
    from: Tile
    to: Tile
    damage: number
    kills: boolean
}

interface ForecastStep {
    name: string
    start: Tile
    path: Tile[]
    attacks: ForecastAttack[]
    team: "ally" | "enemy"
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

    public onChange?: () => void
    public onGameOver?: (won: boolean) => void
    public onMessage?: (text: string) => void

    constructor(board: Board) {
        this.board = board
        board.onTileTap = (tile) => void this.handleTap(tile)
        board.onTileHover = (tile) => this.handleHover(tile)
        this.abilities = [new Nen(this), new LaplaceDemon(this)]
        this.reset()
    }

    public get allActions(): Action[] {
        return [
            ...this.player.actions,
            ...this.abilities.flatMap((a) => a.actions),
        ]
    }

    /** Show a short message. An empty string clears it. */
    public say(text: string) {
        this.onMessage?.(text)
    }

    public reset() {
        for (const a of this.abilities) a.reset()
        if (this.player) this.player.destroy()
        for (const e of this.enemies) e.destroy()

        this.player = new Player(this.board, PLAYER_START.col, PLAYER_START.row)
        this.enemies = ENEMY_STARTS.map(
            (s) => new Enemy(this.board, s.col, s.row),
        )
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
        const p = this.player
        if (action.requiresStatus && !p.hasStatus(action.requiresStatus))
            return false
        if (action.forbidsStatus && p.hasStatus(action.forbidsStatus))
            return false
        return true
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
            this.say("")
            this.player.spendAp(action.apCost)
            this.selectedAction = null
            action.run()
            for (const a of this.abilities) a.check()
        } else {
            this.selectedAction = this.selectedAction === action ? null : action
        }
        this.refreshHighlights()
        this.onChange?.()
    }

    public async endTurn() {
        if (this.phase !== "player") return

        this.phase = "enemy"
        this.selectedAction = null
        this.say("")
        for (const a of this.abilities) a.onTurnEnd()
        this.clearAllHighlights()
        this.updateFog()
        this.onChange?.()

        // Clones and other ability entities act first
        for (const ability of this.abilities) {
            await wait(300)
            await ability.playTurn()
            ability.check()
            this.onChange?.()
            if (await this.checkEnd()) return
        }

        for (const enemy of this.enemies) {
            if (enemy.isDead) continue
            await wait(400)

            const target = this.targetFor(enemy)
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
        const expired = this.player.tickStatuses()
        if (expired.length > 0) this.say(`${expired.join(", ")} faded`)
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

    private movementReason() {
        for (const a of this.abilities) {
            const reason = a.blocksMovement()
            if (reason) return reason
        }
        return null
    }

    private async tryMove(tile: Tile) {
        const reason = this.movementReason()
        if (reason) {
            this.say(reason)
            return
        }

        // You can walk through allies but not stop on someone
        if (this.entityAt(tile)) return

        const found = this.board.getReachable(
            this.player,
            this.player.stats.ap,
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
        if (!this.board.hasLineOfSight(this.player, tile)) {
            this.say("A wall is in the way")
            return
        }

        this.phase = "busy"
        this.clearAllHighlights()

        this.player.spendAp(action.apCost)
        this.onChange?.()
        const damage = computeDamage(action, this.player, target)
        const dealt = await target.takeDamage(damage)
        for (const a of this.abilities) a.onDamageDealt(target, dealt)

        const spent = this.player.consumeAttackStatuses()
        if (spent.length > 0) this.say(`${spent.join(", ")} spent`)
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
        let entity = tile ? this.entityAt(tile) : undefined

        // Can't inspect what is hidden in the dark
        const fog = this.fogTiles()
        if (
            tile &&
            fog &&
            !fog.some((v) => v.col === tile.col && v.row === tile.row)
        ) {
            entity = undefined
        }
        this.inspected = entity ?? null

        this.board.clearHighlight("hover")
        if (entity && this.phase === "player" && !this.movementReason()) {
            const isPlayer = entity === this.player

            // The player's movement area is already shown by the main layer
            if (!(isPlayer && !this.selectedAction)) {
                const ap = isPlayer ? entity.stats.ap : entity.stats.maxAp
                const color = isPlayer ? 0x3b82f6 : 0xfacc15
                this.board.highlight(
                    "hover",
                    this.reachableTiles(entity, ap, isPlayer),
                    color,
                    0.45,
                )
            }
        }
        this.onChange?.()
    }

    // ---------- Highlights, fog and forecast ----------

    private clearAllHighlights() {
        this.board.clearHighlight("main")
        this.board.clearHighlight("preview")
        this.board.clearHighlight("hover")
        this.board.clearArrows()
    }

    private fogTiles(): Tile[] | null {
        for (const a of this.abilities) {
            const tiles = a.visibleTiles()
            if (tiles) return tiles
        }
        return null
    }

    private updateFog() {
        this.board.setFog(this.fogTiles())
    }

    private refreshHighlights() {
        this.updateFog()
        this.board.clearHighlight("main")
        this.board.clearHighlight("preview")
        this.board.clearArrows()
        if (this.phase !== "player") return

        const action = this.selectedAction
        if (action) {
            // Red = can hit. Grey = in range but a wall is in the way.
            const { clear, blocked } = this.board.attackRange(
                this.player,
                action.minRange,
                action.maxRange,
            )
            this.board.highlight("main", clear, 0xef4444)
            this.board.addHighlight("main", blocked, 0x64748b, 0.5)
        } else if (!this.movementReason()) {
            // Orange = walking there would break an active ability
            const tiles = this.reachableTiles(
                this.player,
                this.player.stats.ap,
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
        // Several chips on one tile are stacked upwards
        const stacked = new Map<string, number>()
        const chip = (tile: Tile, text: string, color: number) => {
            const key = tileKey(tile)
            const n = stacked.get(key) ?? 0
            stacked.set(key, n + 1)
            this.board.addTag(tile, text, color, 80 + n * 28)
        }

        this.computeForecast().forEach((step, i) => {
            const enemy = step.team === "enemy"
            const moveColor = enemy ? 0xec4899 : 0x22d3ee
            const hitColor = enemy ? 0xef4444 : 0xd97706

            const end =
                step.path.length > 0
                    ? step.path[step.path.length - 1]
                    : step.start
            if (step.path.length > 0) {
                this.board.drawPathArrow(step.start, step.path, moveColor)
                this.board.addHighlight("preview", [end], moveColor, 0.3)
            }
            // Order of play + who
            this.board.addTag(end, `${i + 1}  ${step.name}`, moveColor, 6)

            for (const a of step.attacks) {
                this.board.drawAttackArrow(a.from, a.to, hitColor)
                let text = `-${a.damage}`
                if (a.kills) text += " KO"
                else if (!enemy) text += " temp"
                chip(a.to, text, hitColor)
            }
        })
    }

    /** What will happen at the end of this turn, without doing it */
    private computeForecast(): ForecastStep[] {
        const moved = new Map<Entity, Tile>()
        const hp = new Map<Entity, number>()
        const steps: ForecastStep[] = []

        const where = (e: Entity): Tile =>
            moved.get(e) ?? { col: e.col, row: e.row }
        const hpOf = (e: Entity) => hp.get(e) ?? e.stats.hp

        const add = (
            entity: Entity,
            plan: TurnPlan,
            team: ForecastStep["team"],
        ) => {
            const start = where(entity)
            const end =
                plan.path.length > 0 ? plan.path[plan.path.length - 1] : start
            moved.set(entity, end)

            const attacks: ForecastAttack[] = []
            for (const { target, action } of plan.attacks) {
                if (hpOf(target) <= 0) break
                const damage = computeDamage(action, entity, target)
                const after = Math.max(0, hpOf(target) - damage)
                hp.set(target, after)
                attacks.push({
                    from: end,
                    to: where(target),
                    damage,
                    kills: after <= 0,
                })
            }
            steps.push({
                name: entity.displayName,
                start,
                path: plan.path,
                attacks,
                team,
            })
        }

        for (const ability of this.abilities) {
            for (const { entity, plan } of ability.plannedTurns())
                add(entity, plan, "ally")
        }

        for (const enemy of this.enemies) {
            if (enemy.isDead || hpOf(enemy) <= 0) continue
            const target = this.targetFor(enemy)
            const plan = enemy.plan(target, where(target), (t) =>
                this.isOccupied(t, moved),
            )
            add(enemy, plan, "enemy")
        }
        return steps
    }

    // ---------- Helpers ----------

    private reachableTiles(from: Tile, ap: number, forPlayer: boolean) {
        const blocked = forPlayer
            ? this.isBlockedForPlayer
            : (t: Tile) => this.isOccupied(t)
        const found = this.board.getReachable(from, ap, blocked)
        return Array.from(found.values()).filter(
            (n) => n.dist > 0 && !(forPlayer && this.entityAt(n)),
        )
    }

    /** Who this enemy is going for: a decoy if it was fooled, else the player */
    private targetFor(enemy: Entity): Entity {
        for (const a of this.abilities) {
            const target = a.perceivedTarget(enemy)
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

    /** Is a tile taken? `moved` simulates entities standing somewhere else. */
    public isOccupied(tile: Tile, moved?: Map<Entity, Tile>) {
        return this.everyone.some((e) => {
            if (e.isDead) return false
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
