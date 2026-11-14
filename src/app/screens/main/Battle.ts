import { animate } from "motion"

import type { Ability } from "./abilities/Ability"
import { LaplaceDemon } from "./abilities/LaplaceDemon"
import { Nen } from "./abilities/Nen"
import { Pistol } from "./abilities/Pistol"
import type { Action } from "./core/Actions"
import { computeDamage, isSelfAction } from "./core/Actions"
import type { Script } from "./core/Script"
import { pause, record, runLive, sim, wait } from "./core/Script"
import type { LevelDef } from "./data/Levels"
import { MAPS } from "./data/Maps"
import type { ExitDef } from "./data/Maps"
import { computeForecast } from "./Forecast"
import type { Forecast } from "./Forecast"
import { Perception } from "./Perception"
import { combatLog, logHit } from "./ui/CombatLog"
import type { Board, Tile } from "./world/Board"
import { buildPath, manhattan, tileKey } from "./world/Board"
import { Enemy } from "./world/Enemy"
import type { Entity } from "./world/Entity"
import { Player } from "./world/Player"
import { Preview } from "./world/Preview"

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
    public readonly level: LevelDef
    public mapId = ""
    public player!: Player
    public enemies: Enemy[] = []
    public abilities: Ability[] = []

    public phase: Phase = "player"
    public turn = 1
    /** Enemies you killed for real (clone knockouts don't count) */
    public defeated = 0
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

    constructor(board: Board, level: LevelDef) {
        this.board = board
        this.level = level
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

    public get stageNumber() {
        return Math.max(1, this.level.stages.indexOf(this.mapId) + 1)
    }

    public get objective() {
        return MAPS[this.mapId]?.objective ?? ""
    }

    /** Safe to restart or leave: nothing is animating */
    public get canLeave() {
        return this.phase === "player" || this.phase === "over"
    }

    /** Show a short message. An empty string clears it. During a simulation it becomes a note. */
    public say(text: string) {
        if (sim.dry) {
            if (text) record({ kind: "note", text })
            return
        }
        this.onMessage?.(text)
    }

    /** Stop everything before this battle is thrown away */
    public dispose() {
        this.preview.stop()
        this.board.onTileTap = undefined
        this.board.onTileHover = undefined
        combatLog.onChange = undefined
        this.onChange = undefined
        this.onGameOver = undefined
        this.onMessage = undefined
    }

    public reset() {
        this.preview.stop()
        for (const a of this.abilities) a.reset()

        this.defeated = 0
        this.loadMap(this.level.stages[0], undefined, true)

        this.phase = "player"
        this.turn = 1
        this.selectedAction = null
        this.inspected = null
        this.player.startTurn()

        combatLog.clear()
        combatLog.add(`${this.level.name}: ${MAPS[this.mapId].name}`, 0x94a3b8)
        this.board.clearHighlight("hover")
        this.refreshHighlights()
        this.onChange?.()
    }

    /** Build a map. `arrival` = the exit you come through (default: the map's start tile). */
    private loadMap(mapId: string, arrival?: ExitDef, fresh = false) {
        const map = MAPS[mapId]
        for (const e of this.enemies) e.destroy()

        this.mapId = mapId
        this.board.alpha = 1
        this.board.load(map)

        const start = arrival ? this.board.innerTile(arrival) : map.playerStart
        if (fresh) {
            if (this.player) this.player.destroy()
            this.player = new Player(this.board, start.col, start.row)
            this.board.entityLayer.addChild(this.player)
        } else {
            this.player.place(start)
        }

        this.enemies = map.enemies.map(
            (s) => new Enemy(this.board, s.col, s.row, s.type),
        )
        for (const e of this.enemies) this.board.entityLayer.addChild(e)
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
            const wasAlert = enemy.alert
            const plan = enemy.decide(target, (t) => this.isOccupied(t))
            if (!plan) continue // unaware: stands guard

            if (target && !wasAlert) {
                this.say(`${enemy.displayName} spots you!`)
                combatLog.add(`${enemy.displayName} spots you`, 0xfbbf24)
            } else if (!target) {
                combatLog.add(`${enemy.displayName} searches for you`, 0x94a3b8)
            }

            yield* pause(400)
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

    /** Only dying ends the fight. Winning means passing the last door. */
    private *checkEnd(): Script<boolean> {
        if (!this.player.isDead) return false
        if (sim.dry) {
            record({ kind: "end", won: false })
            return true
        }
        yield* this.conclude(false)
        return true
    }

    private *conclude(won: boolean): Script {
        this.phase = "over"
        this.selectedAction = null
        this.clearAllHighlights()
        combatLog.add(
            won ? "You escaped!" : "You were defeated",
            won ? 0x4ade80 : 0xf87171,
        )
        this.onChange?.()

        yield wait(500)
        this.onGameOver?.(won)
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
            const locked = this.doorReason(exit)
            if (locked) {
                this.say(locked)
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

        const reached = this.board.doorAt(path[path.length - 1])
        if (reached && (await this.useExit(reached))) return

        this.perception.syncView()
        await this.finishAction()
    }

    /** Walk through a door. Returns true when the level is over. */
    private async useExit(exit: ExitDef): Promise<boolean> {
        for (const a of this.abilities) a.onMapChange()

        if (exit.to === "victory") {
            combatLog.add("You step through the final door", 0x4ade80)
            await runLive(this.conclude(true))
            return true
        }

        const dest = exit.to
        const map = MAPS[dest.map]
        if (!map) {
            this.say("That door leads nowhere")
            return false
        }
        const arrival = dest.exit
            ? map.exits.find((e) => e.id === dest.exit)
            : undefined

        await animate(this.board, { alpha: 0 }, { duration: 0.25 })
        this.loadMap(dest.map, arrival)
        this.selectedAction = null
        this.inspected = null
        this.perception.syncView()
        this.refreshDoorStates()
        await animate(this.board, { alpha: 1 }, { duration: 0.25 })

        combatLog.add(`You enter ${map.name}`, 0x94a3b8)
        this.say(map.name)
        return false
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
        const dealt = await target.takeDamage(computeDamage(action, p, target))
        logHit(p, target, action, dealt)
        if (target.isDead) this.defeated++
        await runLive(this.applyPush(p, target, action))

        for (const a of this.abilities) a.afterAction(action)
        // Ko is only spent by physical attacks
        const spent = action.physical ? p.consumeAttackStatuses() : []
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

    // ---------- Pushes (no attack uses them yet, but abilities can) ----------

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

    private exitName(exit: ExitDef) {
        return exit.to === "victory"
            ? "Freedom"
            : (MAPS[exit.to.map]?.name ?? "?")
    }

    /**
     * What hovering a tile tells you:
     *  - a self action on yourself: its cost, and the zone it would start
     *  - an attack on an enemy: the damage and the HP left (or why it's impossible)
     *  - nothing selected: the walking path and its AP cost (and where a door leads)
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

            const damage = computeDamage(action, p, target)
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
        const door = exit ? `  ·  → ${this.exitName(exit)}` : ""
        this.board.addTag(
            tile,
            `${node.dist} AP  ·  ${p.stats.ap - node.dist} left${safe ? "" : "  ·  ends Laplace"}${door}`,
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

    /** Whether an enemy would notice the player standing at a tile (door conditions use this) */
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
            exit.requires?.map((rule) => rule(this, at)).find(Boolean) ?? null
        )
    }

    private refreshDoorStates() {
        const states = new Map<string, string | null>()
        for (const exit of this.board.doors)
            states.set(exit.id, this.doorReason(exit))
        this.board.setDoorStates(states)
    }
}
