import type { Ability } from "./Ability"
import type { Action, AttackAction } from "./Actions"
import { computeDamage } from "./Actions"
import type { Board, Tile } from "./Board"
import { buildPath, manhattan, tileKey } from "./Board"
import { Enemy } from "./Enemy"
import type { Entity } from "./Entity"
import { LaplaceDemon } from "./LaplaceDemon"
import { ENEMY_STARTS, PLAYER_START } from "./Level"
import { EYES, EYES_SENSE, Nen, ZETSU } from "./Nen"
import { Player } from "./Player"
import type { Script, SimEvent } from "./Script"
import { pause, record, runDry, runLive, sim, wait } from "./Script"
import { Preview } from "./Preview"

/** player = waiting for input, busy = an animation is playing */
export type Phase = "player" | "enemy" | "busy" | "over"

export interface ForecastAttack {
    from: Tile
    to: Tile
    damage: number
    kills: boolean
    target: Entity
    pushTo?: Tile
    /** The push drags the real player out of an ability's zone */
    breaks?: boolean
}

export interface ForecastStep {
    actor: Entity
    name: string
    team: "ally" | "enemy"
    start: Tile
    path: Tile[]
    attacks: ForecastAttack[]
    idle?: string
}

/** Where someone stands and how healthy they are once the turn is over */
export interface Outcome {
    entity: Entity
    name: string
    from: Tile
    tile: Tile
    hpBefore: number
    hp: number
    maxHp: number
    dead: boolean
}
export interface PlaybackItem {
    ev: SimEvent
    /** Index in forecast.steps, or -1 when it isn't a timeline step */
    step: number
}
export interface Forecast {
    steps: ForecastStep[]
    notes: string[]
    outcomes: Outcome[]
    playback: PlaybackItem[]
    result?: "won" | "lost"
}

export class Battle {
    public readonly board: Board
    public player!: Player
    public enemies: Enemy[] = []
    public abilities: Ability[] = []

    public phase: Phase = "player"
    public turn = 1
    public selectedAction: AttackAction | null = null
    public inspected: Entity | null = null
    /** The simulated end of this turn (null when no preview is active) */
    public forecast: Forecast | null = null

    private preview: Preview
    /** Timeline step currently being replayed (-1 = none) */
    public activeStep = -1

    public onChange?: () => void
    public onGameOver?: (won: boolean) => void
    public onMessage?: (text: string) => void

    constructor(board: Board) {
        this.board = board
        this.preview = new Preview(board)
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

        this.player = new Player(this.board, PLAYER_START.col, PLAYER_START.row)
        this.enemies = ENEMY_STARTS.map(
            (s) => new Enemy(this.board, s.col, s.row, s.type),
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
        this.syncView()
        this.onChange?.()

        // The very same script powers the preview (see computeForecast)
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
    private *enemyPhase(): Script<boolean> {
        // Clones and other ability entities act first
        for (const ability of this.abilities) {
            yield* pause(300)
            yield* ability.playTurn()
            ability.check()
            this.changed()
            if (yield* this.checkEnd()) return true
        }

        for (const enemy of this.enemies) {
            if (enemy.isDead) continue

            const target = this.targetFor(enemy)
            if (!target) {
                record({
                    kind: "idle",
                    actor: enemy,
                    at: { col: enemy.col, row: enemy.row },
                    reason: "lost track of you",
                })
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
        this.onChange?.()

        yield wait(500)
        this.onGameOver?.(won)
        return true
    }

    /** Refresh visibility and the HUD after something happened (live only) */
    private changed() {
        if (sim.dry) return
        this.syncView()
        this.onChange?.()
    }

    // ---------- Player input ----------

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

        // The player can walk through the clone but never stops on anyone
        const found = this.board.getReachable(
            this.player,
            this.player.stats.ap,
            this.isBlockedForPlayer,
            (t) => !this.entityAt(t),
        )
        const node = found.get(tileKey(tile))
        if (!node || node.dist === 0) return

        this.phase = "busy"
        this.clearAllHighlights()
        await this.player.followPath(buildPath(node))
        this.syncView()
        await this.finishAction()
    }

    private async useAction(action: AttackAction, tile: Tile) {
        const target = this.enemies.find(
            (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
        )
        // You can't target what you can't perceive
        if (!target || !this.playerPerceives(target)) return

        const refusal = this.abilities
            .map((a) => a.blocksTarget(target))
            .find(Boolean)
        if (refusal) {
            this.say(refusal)
            return
        }

        const distance = manhattan(this.player, tile)
        if (distance < action.minRange || distance > action.maxRange) return
        if (!this.board.hasLineOfSight(this.player, tile)) {
            this.say("A wall is in the way")
            return
        }

        this.phase = "busy"
        this.clearAllHighlights()

        this.player.spendAp(action.apCost)
        this.onChange?.()
        await target.takeDamage(computeDamage(action, this.player, target))
        await runLive(this.applyPush(this.player, target, action))

        const spent = this.player.consumeAttackStatuses()
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
    public *applyPush(
        attacker: Tile,
        target: Entity,
        action: AttackAction,
    ): Script {
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
        const fog = this.fogTiles()
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
        if (entity && this.phase === "player" && !this.movementReason()) {
            const isPlayer = entity === this.player
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

        this.board.clearArrows()
        if (tile && this.phase === "player") this.drawHoverInfo(tile)
        this.onChange?.()
    }

    /** Path and cost for movement, expected damage for attacks */
    private drawHoverInfo(tile: Tile) {
        if (this.movementReason()) return
        const p = this.player
        const action = this.selectedAction

        if (action) {
            const target = this.enemies.find(
                (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
            )
            if (!target || !this.playerPerceives(target)) return

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
            if (!this.board.hasLineOfSight(p, tile)) {
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

        if (this.entityAt(tile)) return
        const found = this.board.getReachable(
            p,
            p.stats.ap,
            this.isBlockedForPlayer,
            (t) => !this.entityAt(t),
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

    // ---------- Perception ----------

    /** Can the player see (or feel) this entity right now? */
    private playerPerceives(e: Entity) {
        const p = this.player
        const d = manhattan(p, e)
        const sense = p.senseRadius

        if (p.hasStatus(EYES)) {
            // En feels everything, Zetsu users included. Plain eyes-closed doesn't feel Zetsu.
            if (sense > 0 && d <= sense) return true
            return !e.hasStatus(ZETSU) && d <= EYES_SENSE
        }
        if (!e.hasStatus(ZETSU)) return true
        return d <= sense || this.board.hasLineOfSight(p, e)
    }

    /** Hide what the player can't perceive and mark what they only feel */
    private syncView() {
        for (const a of this.abilities) a.refreshView()

        const fog = this.fogTiles()
        const sensed: { tile: Tile; color: number }[] = []
        for (const e of this.enemies) {
            const seen = !e.isDead && this.playerPerceives(e)
            e.visible = seen
            const inDark =
                fog && !fog.some((t) => t.col === e.col && t.row === e.row)
            if (seen && inDark) sensed.push({ tile: e, color: 0xef4444 })
        }
        this.board.setSensed(sensed)
        this.board.setFog(fog)
    }

    private fogTiles(): Tile[] | null {
        let visible: Tile[] | null = null
        for (const a of this.abilities) {
            const tiles = a.visibleTiles()
            if (tiles) visible = [...(visible ?? []), ...tiles]
        }
        return visible
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
        this.syncView()
        this.board.clearHighlight("main")
        this.board.clearHighlight("preview")
        this.board.clearArrows()
        this.forecast = null
        this.activeStep = -1
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

        // Eyes closed with an active ability: replay the coming turn
        if (this.abilities.some((a) => a.showsForecast())) {
            const zone = this.previewZone()
            this.forecast = this.computeForecast(zone)
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

    private computeForecast(zone: Set<string>): Forecast {
        const all = this.everyone
        const before = new Map<Entity, { tile: Tile; hp: number }>(
            all.map((e) => [
                e,
                { tile: { col: e.col, row: e.row }, hp: e.stats.hp },
            ]),
        )
        const restores = [
            ...all.map((e) => e.snapshot()),
            ...this.abilities.map((a) => a.snapshot()),
        ]

        let events: SimEvent[] = []
        let outcomes: Outcome[] = []
        sim.dry = true
        sim.events = []
        try {
            runDry(this.enemyPhase())
            events = sim.events
            outcomes = all.map((e) => ({
                entity: e,
                name: e.displayName,
                from: before.get(e)!.tile,
                tile: { col: e.col, row: e.row },
                hpBefore: before.get(e)!.hp,
                hp: e.stats.hp,
                maxHp: e.stats.maxHp,
                dead: e.isDead,
            }))
        } finally {
            sim.dry = false
            sim.events = []
            for (const restore of restores.reverse()) restore()
        }
        return this.buildForecast(events, outcomes, zone)
    }

    /** Group events into one step per actor. Anything outside the zone is left out of the steps. */
    private buildForecast(
        events: SimEvent[],
        outcomes: Outcome[],
        zone: Set<string>,
    ): Forecast {
        const inZ = (t: Tile) => zone.has(tileKey(t))
        const isSeen = (ev: SimEvent) => {
            switch (ev.kind) {
                case "move":
                    return inZ(ev.from) || ev.path.some(inZ)
                case "attack":
                case "push":
                    return inZ(ev.from) || inZ(ev.to)
                case "idle":
                    return inZ(ev.at)
                case "heal":
                    return false
                default:
                    return true
            }
        }

        const steps: ForecastStep[] = []
        const notes: string[] = []
        const playback: PlaybackItem[] = []
        let lastAttack: ForecastAttack | null = null
        let killSeen = false
        let ended: boolean | undefined

        const stepFor = (actor: Entity, start: Tile) => {
            const last = steps[steps.length - 1]
            if (last && last.actor === actor) return last
            const step: ForecastStep = {
                actor,
                name: actor.displayName,
                team: actor instanceof Enemy ? "enemy" : "ally",
                start,
                path: [],
                attacks: [],
            }
            steps.push(step)
            return step
        }

        for (const ev of events) {
            let index = -1
            if (isSeen(ev)) {
                switch (ev.kind) {
                    case "move": {
                        const start = inZ(ev.from)
                            ? ev.from
                            : ev.path.find(inZ)!
                        const step = stepFor(ev.actor, start)
                        step.path = ev.path.filter(inZ)
                        index = steps.indexOf(step)
                        break
                    }
                    case "attack": {
                        const step = stepFor(ev.actor, ev.from)
                        lastAttack = {
                            from: ev.from,
                            to: ev.to,
                            damage: ev.damage,
                            kills: ev.kills,
                            target: ev.target,
                        }
                        if (ev.kills) killSeen = true
                        step.attacks.push(lastAttack)
                        index = steps.indexOf(step)
                        break
                    }
                    case "push":
                        if (lastAttack && lastAttack.target === ev.target) {
                            lastAttack.pushTo = ev.to
                            lastAttack.breaks = ev.breaks
                        }
                        break
                    case "idle": {
                        const step = stepFor(ev.actor, ev.at)
                        step.idle = ev.reason
                        index = steps.indexOf(step)
                        break
                    }
                    case "note":
                        notes.push(ev.text)
                        break
                    case "end":
                        ended = ev.won
                        break
                }
            }
            playback.push({ ev, step: index })
        }

        // A victory is only known if you saw the killing blow
        let result: Forecast["result"]
        if (ended === false) result = "lost"
        else if (ended === true && killSeen) result = "won"

        return { steps, notes, outcomes, playback, result }
    }

    // ---------- Helpers ----------

    private reachableTiles(from: Tile, ap: number, forPlayer: boolean) {
        const found = forPlayer
            ? this.board.getReachable(
                  from,
                  ap,
                  this.isBlockedForPlayer,
                  (t) => !this.entityAt(t),
              )
            : this.board.getReachable(from, ap, (t) => this.isOccupied(t))
        return Array.from(found.values()).filter((n) => n.dist > 0)
    }

    /** Who this enemy believes it is fighting, or null if it can't find anyone */
    private targetFor(enemy: Entity): Entity | null {
        for (const a of this.abilities) {
            const target = a.perceivedTarget(enemy)
            if (target) return target
        }
        return this.canPerceivePlayer(enemy) ? this.player : null
    }

    /** Zetsu hides you, unless the enemy has a clear line of sight or senses you with En */
    private canPerceivePlayer(enemy: Entity) {
        if (!this.player.hasStatus(ZETSU)) return true
        if (
            enemy.senseRadius > 0 &&
            manhattan(enemy, this.player) <= enemy.senseRadius
        ) {
            return true
        }
        return this.board.hasLineOfSight(enemy, this.player)
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

    public hasEnemyAt(tile: Tile) {
        return this.enemies.some(
            (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
        )
    }

    public isOccupied(tile: Tile) {
        return this.everyone.some(
            (e) => !e.isDead && e.col === tile.col && e.row === tile.row,
        )
    }

    /** Only enemies stop the player from walking through (the clone is an illusion) */
    private isBlockedForPlayer = (tile: Tile) => this.hasEnemyAt(tile)
}
