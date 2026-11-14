import type { Ability } from "./abilities/Ability"
import type { Action } from "./core/Actions"
import { computeDamage, isSelfAction } from "./core/Actions"
import type { Board, Tile } from "./world/Board"
import { buildPath, manhattan, tileKey } from "./world/Board"
import { combatLog, logHit } from "./ui/CombatLog"
import { Enemy } from "./world/Enemy"
import type { Entity } from "./world/Entity"
import { computeForecast } from "./Forecast"
import type { Forecast } from "./Forecast"
import { LaplaceDemon } from "./abilities/LaplaceDemon"
import { MAPS, START_MAP } from "./data/Maps"
import type { ExitDef, MapDef } from "./data/Maps"
import { Nen } from "./abilities/Nen"
import { Perception } from "./Perception"
import { Pistol } from "./abilities/Pistol"
import { Player } from "./world/Player"
import { Preview } from "./world/Preview"
import type { Script } from "./core/Script"
import { pause, record, runLive, sim, wait } from "./core/Script"

export type {
    Forecast,
    ForecastAttack,
    ForecastStep,
    Outcome,
    PlaybackItem,
} from "./Forecast"

/** player = waiting for input, busy = an animation is playing */
export type Phase = "player" | "enemy" | "busy" | "over"

export class Battle {
    public readonly board: Board
    private currentMapId = START_MAP
    public player!: Player
    public enemies: Enemy[] = []
    public abilities: Ability[] = []

    public phase: Phase = "player"
    public turn = 1
    public selectedAction: Action | null = null
    public inspected: Entity | null = null
    /** The simulated end of this turn (null when no preview is active) */
    public forecast: Forecast | null = null
    /** Timeline step currently being replayed (-1 = none) */
    public activeStep = -1

    public onChange?: () => void
    public onGameOver?: (won: boolean) => void
    public onMessage?: (text: string) => void

    public readonly perception: Perception
    private preview: Preview

    constructor(board: Board) {
        this.board = board
        this.preview = new Preview(board)
        this.perception = new Perception(this)
        board.onTileTap = (tile) => void this.handleTap(tile)
        board.onTileHover = (tile) => this.handleHover(tile)
        this.abilities = [new Pistol(), new Nen(this), new LaplaceDemon(this)]
        this.reset()
    }

    public get allActions(): Action[] {
        return [
            ...this.player.actions,
            ...this.abilities.flatMap((a) => a.actions),
        ]
    }

    /** Show a short message. An empty string clears it. During a simulation it becomes a note. */
    public say(text: string) {
        if (sim.dry) {
            if (text) record({ kind: "note", text })
            return
        }
        this.onMessage?.(text)
    }

    public reset() {
        this.preview.stop()
        for (const a of this.abilities) a.reset()
        if (this.player) this.player.destroy()
        for (const e of this.enemies) e.destroy()

        this.currentMapId = START_MAP
        const map = MAPS[this.currentMapId]
        this.board.load(map)
        this.player = new Player(
            this.board,
            map.playerStart.col,
            map.playerStart.row,
        )
        this.enemies = map.enemies.map(
            (s) => new Enemy(this.board, s.col, s.row, s.type),
        )
        this.board.entityLayer.addChild(this.player)
        for (const e of this.enemies) this.board.entityLayer.addChild(e)

        this.phase = "player"
        this.turn = 1
        this.selectedAction = null
        this.inspected = null
        this.player.startTurn()

        combatLog.clear()
        combatLog.add("The fight begins", 0x94a3b8)
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
        if (action.visible && !action.visible()) return false
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

    /** Selecting only arms the action. It happens when you click a target (yourself for range 0). */
    public selectAction(action: Action) {
        if (this.phase !== "player") return

        const reason = this.unusableReason(action)
        if (reason) {
            this.say(reason)
            return
        }

        this.say("")
        this.selectedAction = this.selectedAction === action ? null : action
        this.refreshHighlights()
        this.onChange?.()
    }

    public cancelSelection() {
        if (this.phase !== "player" || !this.selectedAction) return
        this.selectedAction = null
        this.refreshHighlights()
        this.onChange?.()
    }

    // ---------- The turn ----------

    public async endTurn() {
        if (this.phase !== "player") return

        this.phase = "enemy"
        this.selectedAction = null
        this.say("")
        for (const a of this.abilities) a.onTurnEnd()
        this.clearAllHighlights()
        this.perception.syncView()
        combatLog.add(`Turn ${this.turn}: enemy phase`, 0x94a3b8)
        this.onChange?.()

        // The very same script powers the preview (see Forecast.ts)
        if (await runLive(this.enemyPhase())) return

        this.turn++
        this.player.startTurn()
        const expired = this.player.tickStatuses()
        if (expired.length > 0) this.say(`${expired.join(", ")} faded`)
        for (const a of this.abilities) a.onTurnStart()
        this.phase = "player"
        this.refreshHighlights()
        this.onChange?.()
    }

    /**
     * Everything that happens after you end your turn. Returns true if the fight ended.
     * It runs live (animated) or dry (silent simulation), so the preview can't lie.
     */
    public *enemyPhase(): Script<boolean> {
        // Clones and other ability entities act first
        for (const ability of this.abilities) {
            yield* pause(300)
            yield* ability.playTurn()
            ability.check()
            this.changed()
            if (yield* this.checkEnd()) return true
        }

        for (const enemy of this.enemies) {
            if (enemy.isOut) continue

            const target = this.perception.targetFor(enemy)
            if (!target) {
                record({
                    kind: "idle",
                    actor: enemy,
                    at: { col: enemy.col, row: enemy.row },
                    reason: "lost track of you",
                })
                combatLog.add(
                    `${enemy.displayName} lost track of you`,
                    0x94a3b8,
                )
                continue
            }
            yield* pause(400)

            const plan = enemy.plan(target, target, (t) => this.isOccupied(t))
            yield* enemy.execute(plan, {
                afterHit: (hit, action) => this.applyPush(enemy, hit, action),
            })

            if (yield* this.checkEnd()) return true
            for (const a of this.abilities) a.check()
            this.changed()
        }

        yield* pause(300)
        return yield* this.checkEnd()
    }

    private *checkEnd(): Script<boolean> {
        const won = this.enemies.every((e) => e.isDead)
        const lost = this.player.isDead
        if (!won && !lost) return false

        if (sim.dry) {
            record({ kind: "end", won })
            return true
        }

        this.phase = "over"
        this.selectedAction = null
        this.clearAllHighlights()
        combatLog.add(
            won ? "Victory!" : "You were defeated",
            won ? 0x4ade80 : 0xf87171,
        )
        this.onChange?.()

        yield wait(500)
        this.onGameOver?.(won)
        return true
    }

    /** Refresh visibility and the HUD after something happened (live only) */
    private changed() {
        if (sim.dry) return
        this.perception.syncView()
        this.refreshDoorStates()
        this.onChange?.()
    }

    // ---------- Player input ----------

    private async handleTap(tile: Tile) {
        if (this.phase !== "player") return
        if (this.board.doorAt(tile)) {
            if (this.selectedAction) {
                this.selectedAction = null
                this.refreshHighlights()
                this.onChange?.()
            }
            await this.tryMove(tile)
        } else if (this.selectedAction) {
            await this.useAction(this.selectedAction, tile)
        } else {
            await this.tryMove(tile)
        }
    }

    private movementReason() {
        for (const a of this.abilities) {
            const reason = a.blocksMovement()
            if (reason) return reason
        }
        return null
    }

    private async tryMove(tile: Tile) {
        const exit = this.board.doorAt(tile)
        if (exit) {
            const doorReason = this.doorReason(exit)
            if (doorReason) {
                this.say(doorReason)
                return
            }
        }

        const reason = this.movementReason()
        if (reason) {
            this.say(reason)
            return
        }

        // The player can walk through the clone but never stops on anyone
        const found = this.board.getReachable(
            this.player,
            this.player.stats.ap,
            this.isBlockedForPlayer,
            (t) => !this.entityAt(t),
            true,
        )
        const node = found.get(tileKey(tile))
        if (!node || node.dist === 0) return

        this.phase = "busy"
        this.clearAllHighlights()
        const path = buildPath(node)
        await this.player.followPath(path)
        const reachedExit =
            path.length > 0 && this.board.doorAt(path[path.length - 1])
        if (reachedExit) await this.changeMap(reachedExit)
        this.perception.syncView()
        await this.finishAction()
    }

    private async useAction(action: Action, tile: Tile) {
        const reason = this.unusableReason(action)
        if (reason) {
            this.say(reason)
            this.cancelSelection()
            return
        }
        if (isSelfAction(action)) await this.useSelfAction(action, tile)
        else await this.useAttack(action, tile)
    }

    /** Range 0: you click yourself */
    private async useSelfAction(action: Action, tile: Tile) {
        const p = this.player
        if (tile.col !== p.col || tile.row !== p.row) {
            this.say(`Click yourself to use ${action.name}`)
            return
        }

        this.say("")
        p.spendAp(action.apCost)
        this.selectedAction = null
        action.run?.()
        combatLog.add(`You use ${action.name}`, 0x93c5fd)
        for (const a of this.abilities) a.afterAction(action)
        for (const a of this.abilities) a.check()

        this.refreshHighlights()
        this.onChange?.()
    }

    private async useAttack(action: Action, tile: Tile) {
        const p = this.player
        const target = this.enemies.find(
            (e) => !e.isOut && e.col === tile.col && e.row === tile.row,
        )
        // You can't target what you can't perceive
        if (!target || !this.perception.playerPerceives(target)) return

        const refusal = this.abilities
            .map((a) => a.blocksTarget(target))
            .find(Boolean)
        if (refusal) {
            this.say(refusal)
            return
        }

        const d = manhattan(p, tile)
        if (d < action.minRange || d > action.maxRange) return
        if (!this.board.canHit(p, tile, action)) {
            this.say("A wall is in the way")
            return
        }

        this.phase = "busy"
        this.clearAllHighlights()

        p.spendAp(action.apCost)
        this.onChange?.()
        const dealt = await target.takeDamage(
            computeDamage(action as never, p, target),
        )
        logHit(p, target, action, dealt)
        await runLive(this.applyPush(p, target, action))

        for (const a of this.abilities) a.afterAction(action)
        const spent = p.consumeAttackStatuses()
        if (spent.length > 0) this.say(`${spent.join(", ")} spent`)
        await this.finishAction()
    }

    private async finishAction() {
        if (await runLive(this.checkEnd())) return
        for (const a of this.abilities) a.check()

        this.phase = "player"
        if (this.selectedAction && this.unusableReason(this.selectedAction)) {
            this.selectedAction = null
        }
        this.refreshHighlights()
        this.onChange?.()
    }

    // ---------- Pushes ----------

    /** Slide the target away from the attacker (used by every attacker) */
    public *applyPush(attacker: Tile, target: Entity, action: Action): Script {
        if (!action.push || target.isDead) return
        const path = this.pushPath(attacker, target, action.push)
        if (path.length === 0) return

        const landing = path[path.length - 1]
        record({
            kind: "push",
            target,
            from: { col: target.col, row: target.row },
            to: landing,
            path,
            breaks:
                target === this.player &&
                !this.abilities.every((a) => a.isTileSafe(landing)),
        })
        combatLog.add(
            `${target.displayName} is pushed ${path.length} tile(s)`,
            0x94a3b8,
        )
        yield target.slide(path)
    }

    /** Tiles the target would slide through. Stops at walls, edges and entities. */
    private pushPath(from: Tile, at: Tile, distance: number): Tile[] {
        const dc = at.col - from.col
        const dr = at.row - from.row
        const step =
            Math.abs(dc) >= Math.abs(dr)
                ? { col: Math.sign(dc), row: 0 }
                : { col: 0, row: Math.sign(dr) }

        const path: Tile[] = []
        let current = { col: at.col, row: at.row }
        for (let i = 0; i < distance; i++) {
            const next = {
                col: current.col + step.col,
                row: current.row + step.row,
            }
            if (!this.board.isInside(next.col, next.row)) break
            if (this.board.isWall(next) || this.isOccupied(next)) break
            path.push(next)
            current = next
        }
        return path
    }

    // ---------- Hover ----------

    private handleHover(tile: Tile | null) {
        let entity = tile ? this.entityAt(tile) : undefined

        // Can't inspect what is hidden or sits in the dark
        const fog = this.perception.fogTiles()
        if (
            tile &&
            fog &&
            !fog.some((v) => v.col === tile.col && v.row === tile.row)
        ) {
            entity = undefined
        }
        if (entity && !entity.visible) entity = undefined
        this.inspected = entity ?? null

        this.board.clearHighlight("hover")
        const action = this.selectedAction
        if (entity && this.phase === "player" && !this.movementReason()) {
            const isPlayer = entity === this.player
            // The player's own movement area is already drawn (and self actions show their own info)
            if (!(isPlayer && (!action || isSelfAction(action)))) {
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

        this.board.clearArrows()
        if (tile && this.phase === "player") this.drawHoverInfo(tile)
        this.onChange?.()
    }

    /**
     * What hovering a tile tells you:
     *  - a self action on yourself: its cost, and the zone it would start
     *  - an attack on an enemy: the damage and the HP left (or why it's impossible)
     *  - nothing selected: the walking path and its AP cost
     */
    private drawHoverInfo(tile: Tile) {
        const p = this.player
        const action = this.selectedAction
        const onSelf = tile.col === p.col && tile.row === p.row

        if (action) {
            // ----- Self action: click yourself -----
            if (isSelfAction(action)) {
                if (!onSelf) return
                this.board.addTag(
                    tile,
                    `${action.name}  ·  ${action.apCost} AP`,
                    0x22c55e,
                    100,
                )
                for (const a of this.abilities) {
                    const cast = a.selfCastPreview(action)
                    if (!cast) continue
                    this.board.highlight("hover", cast.tiles, 0xa78bfa, 0.3)
                    this.board.addTag(tile, cast.label, 0xa78bfa, 130)
                }
                return
            }

            // ----- Attack: damage on the target -----
            const target = this.enemies.find(
                (e) => !e.isOut && e.col === tile.col && e.row === tile.row,
            )
            if (!target || !this.perception.playerPerceives(target)) return

            const refusal = this.abilities
                .map((a) => a.blocksTarget(target))
                .find(Boolean)
            if (refusal) {
                this.board.addTag(tile, "Fooled: can't attack", 0x64748b, 100)
                return
            }
            const d = manhattan(p, tile)
            if (d < action.minRange || d > action.maxRange) {
                this.board.addTag(tile, "Out of range", 0x64748b, 100)
                return
            }
            if (!this.board.canHit(p, tile, action)) {
                this.board.addTag(tile, "Wall in the way", 0x64748b, 100)
                return
            }

            const damage = computeDamage(action as never, p, target)
            const after = Math.max(0, target.stats.hp - damage)
            this.board.drawAttackArrow(p, tile, 0xef4444)
            this.board.addTag(
                tile,
                `-${damage}   ${target.stats.hp} → ${after}${after <= 0 ? "   KO" : ""}`,
                0xef4444,
                100,
            )
            if (action.push)
                this.board.addTag(tile, `push ${action.push}`, 0x475569, 130)
            return
        }

        // ----- Nothing selected: walking -----
        if (this.movementReason() || this.entityAt(tile)) return
        const exit = this.board.doorAt(tile)
        if (exit) {
            const reason = this.doorReason(exit)
            if (reason) {
                this.board.addTag(tile, reason, 0xdc2626, 60)
                return
            }
        }
        const found = this.board.getReachable(
            p,
            p.stats.ap,
            this.isBlockedForPlayer,
            (t) => !this.entityAt(t),
            true,
        )
        const node = found.get(tileKey(tile))
        if (!node || node.dist === 0) return

        const safe = this.abilities.every((a) => a.isTileSafe(tile))
        const color = safe ? 0x3b82f6 : 0xf97316
        this.board.drawPathArrow(p, buildPath(node), color)
        this.board.addTag(
            tile,
            `${node.dist} AP  ·  ${p.stats.ap - node.dist} left${safe ? "" : "  ·  ends Laplace"}`,
            color,
            60,
        )
    }

    // ---------- Highlights and forecast ----------

    private clearAllHighlights() {
        this.preview.stop()
        this.board.clearHighlight("main")
        this.board.clearHighlight("preview")
        this.board.clearHighlight("hover")
        this.board.clearArrows()
        this.forecast = null
        this.activeStep = -1
    }

    private refreshHighlights() {
        this.preview.stop()
        this.perception.syncView()
        this.refreshDoorStates()
        this.board.clearHighlight("main")
        this.board.clearHighlight("preview")
        this.board.clearArrows()
        this.forecast = null
        this.activeStep = -1
        if (this.phase !== "player") return

        const action = this.selectedAction
        if (action && isSelfAction(action)) {
            // Green = click yourself
            this.board.highlight("main", [this.player], 0x22c55e, 0.55)
        } else if (action) {
            // Red = can hit. Grey = in range but a wall is in the way.
            const { clear, blocked } = this.board.attackRange(
                this.player,
                action.minRange,
                action.maxRange,
                action.needsSight !== false,
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

        // Eyes closed with an active ability: replay the coming turn
        if (this.abilities.some((a) => a.showsForecast())) {
            const zone = this.previewZone()
            this.forecast = computeForecast(this, zone)
            this.preview.play(this.forecast, {
                zone,
                isEnemy: (e) => e instanceof Enemy,
                onStep: (i) => {
                    this.activeStep = i
                    this.onChange?.()
                },
            })
        }
    }

    /** The tiles the player can foresee (the ability's range) */
    private previewZone(): Set<string> {
        for (const a of this.abilities) {
            if (!a.showsForecast()) continue
            const tiles = a.previewTiles()
            if (tiles) return new Set(tiles.map(tileKey))
        }
        return new Set(
            this.board
                .tilesInRange({ col: 0, row: 0 }, 0, 999, true)
                .map(tileKey),
        )
    }

    // ---------- Helpers ----------

    private reachableTiles(from: Tile, ap: number, forPlayer: boolean) {
        const found = forPlayer
            ? this.board.getReachable(
                  from,
                  ap,
                  this.isBlockedForPlayer,
                  (t) => !this.entityAt(t),
                  true,
              )
            : this.board.getReachable(from, ap, (t) => this.isOccupied(t))
        return Array.from(found.values()).filter((n) => n.dist > 0)
    }

    public get everyone(): Entity[] {
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

    public hasEnemyAt(tile: Tile) {
        return this.enemies.some(
            (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
        )
    }

    /** Whether an enemy would notice the player standing at a specific tile. */
    public canPerceivePlayer(enemy: Entity, at?: Tile) {
        return this.perception.canPerceivePlayer(enemy, at)
    }

    /** Knocked-out entities still take up their tile */
    public isOccupied(tile: Tile) {
        return this.everyone.some(
            (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
        )
    }

    /** Enemies and locked exits stop the player; the clone remains passable. */
    private isBlockedForPlayer = (tile: Tile) => {
        if (this.hasEnemyAt(tile)) return true
        const exit = this.board.doorAt(tile)
        return !!exit && !!this.doorReason(exit)
    }

    /** Why an exit is locked, or null when it can be used. */
    private doorReason(exit: ExitDef) {
        const at = this.board.doorTile(exit)
        return (
            exit.requires
                ?.map((condition) => condition(this, at))
                .find(Boolean) ?? null
        )
    }

    private refreshDoorStates() {
        const states = new Map<string, string | null>()
        for (const exit of this.board.doors)
            states.set(exit.id, this.doorReason(exit))
        this.board.setDoorStates(states)
    }

    private async changeMap(exit: ExitDef) {
        const map: MapDef | undefined = MAPS[exit.to.map]
        const entry = map?.exits.find((candidate) => candidate.id === exit.to.exit)
        if (!map || !entry) {
            this.say("That exit has no destination")
            return
        }

        for (const ability of this.abilities) ability.onMapChange()
        for (const enemy of this.enemies) enemy.destroy()

        this.selectedAction = null
        this.currentMapId = exit.to.map
        this.board.load(map)
        await this.player.slide([this.board.innerTile(entry)])
        this.enemies = map.enemies.map(
            (spawn) => new Enemy(this.board, spawn.col, spawn.row, spawn.type),
        )
        for (const enemy of this.enemies)
            this.board.entityLayer.addChild(enemy)

        combatLog.add(`You enter ${map.name}`, 0x94a3b8)
        this.inspected = null
        this.refreshHighlights()
    }
}
