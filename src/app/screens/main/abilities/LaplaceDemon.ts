import { BaseAbility } from "./Ability"
import type { Resource } from "./Ability"
import type { Action } from "../core/Actions"
import type { Battle } from "../Battle"
import { manhattan } from "../world/Board"
import type { Tile } from "../world/Board"
import { Clone } from "../world/Clone"
import type { Entity } from "../world/Entity"
import { EYES, ZETSU } from "./Nen"
import { executePlan, planTurn } from "../core/Planner"
import type { TurnPlan } from "../core/Planner"
import { sim } from "../core/Script"
import type { Script } from "../core/Script"

const ZONE = "laplace"
const ZONE_RADIUS = 6
const MAX_CHARGE = 100
const START_CHARGE = 50
const ACTIVATION_COST = 20
const REBUILD_COST = 10
/** Charge gained per turn while the ability is off */
const REGEN = 10
/** false = the clone is only drawn while your eyes are closed (the preview) */
const CLONE_ALWAYS_VISIBLE = false

export class LaplaceDemon extends BaseAbility {
    public readonly charge: Resource = {
        id: "laplace-charge",
        name: "Laplace charge",
        color: 0xa78bfa,
        value: START_CHARGE,
        max: MAX_CHARGE,
    }
    public override resources = [this.charge]

    private active = false
    private clone: Clone | null = null
    private center = { col: 0, row: 0 }
    /** Enemies inside the zone on activation that still believe the clone */
    private deceived = new Set<Entity>()
    /** Clone damage dealt to each enemy (given back if the ability ends) */
    private ledger = new Map<Entity, number>()

    constructor(private battle: Battle) {
        super()

        this.actions = [
            {
                kind: "instant",
                id: "new-clone",
                name: "New Clone",
                group: "Senses",
                subtitle: `${REBUILD_COST} charge`,
                description:
                    "Create a new clone. Enemies inside the zone are fooled again. Only available while Laplace is active and the clone is gone.",
                apCost: 2,
                visible: () => this.active && !this.clone,
                unavailable: () =>
                    this.charge.value < REBUILD_COST
                        ? "Not enough charge"
                        : null,
                run: () => {
                    this.charge.value -= REBUILD_COST
                    this.spawnClone()
                    this.battle.say(
                        "A new clone appears. Enemies in the zone are fooled again.",
                    )
                },
            },
        ] satisfies Action[]
    }

    public override get entities(): Entity[] {
        return this.clone ? [this.clone] : []
    }

    // ---------- Ability hooks ----------

    /** Fooled enemies see the clone. En does not help against it. */
    public override perceivedTarget(viewer: Entity) {
        if (!this.active || !this.clone || this.clone.isDead) return null
        return this.deceived.has(viewer) ? this.clone : null
    }

    /** You can only attack enemies that can see the real you */
    public override blocksTarget(target: Entity) {
        return this.active && this.deceived.has(target)
            ? `${target.displayName} is fooled, you can't attack it while hidden`
            : null
    }

    public override plannedTurns() {
        if (!this.active || !this.clone) return []
        return [{ entity: this.clone, plan: this.planClone() }]
    }

    public override showsForecast() {
        return this.active && this.battle.player.hasStatus(EYES)
    }

    public override visibleTiles() {
        if (!this.showsForecast()) return null
        return this.battle.board.tilesInRange(this.center, 0, ZONE_RADIUS, true)
    }

    public override refreshView() {
        if (!this.clone || this.clone.destroyed) return
        this.clone.visible =
            CLONE_ALWAYS_VISIBLE || this.battle.player.hasStatus(EYES)
    }

    public override isTileSafe(tile: Tile) {
        return !this.active || this.inZone(tile)
    }

    /** Eyes closed with Zetsu on starts the ability */
    public override onEyesClosed() {
        if (this.active || !this.battle.player.hasStatus(ZETSU)) return
        if (this.charge.value < ACTIVATION_COST) {
            this.battle.say("Not enough Laplace charge")
            return
        }
        this.activate()
    }

    public override onDamageDealt(target: Entity, amount: number) {
        if (!this.active) return
        this.ledger.set(target, (this.ledger.get(target) ?? 0) + amount)
    }

    public override onTurnStart() {
        if (!this.active) {
            this.charge.value = Math.min(MAX_CHARGE, this.charge.value + REGEN)
        }
    }

    public override *playTurn(): Script {
        const clone = this.clone
        if (!this.active || !clone) return
        yield* executePlan(clone, this.planClone(), {
            onDamage: (target, dealt) => this.onDamageDealt(target, dealt),
            afterHit: (target, action) =>
                this.battle.applyPush(clone, target, action),
        })
    }

    /** Ends only when Zetsu drops or you leave the zone */
    public override check() {
        if (!this.active || this.battle.phase === "over") return
        if (!this.battle.player.hasStatus(ZETSU))
            return this.end("Zetsu released")

        for (const enemy of [...this.deceived]) {
            if (enemy.isDead) {
                this.deceived.delete(enemy)
            } else if (!this.inZone(enemy)) {
                this.deceived.delete(enemy)
                this.battle.say(
                    `${enemy.displayName} left the zone and saw through the illusion`,
                )
            }
        }

        if (this.clone?.isDead) {
            this.loseClone("The clone was destroyed. Fooled enemies lose it.")
        } else if (this.clone && !this.inZone(this.clone)) {
            this.loseClone("The clone was pushed out and dissolved.")
        }

        if (!this.inZone(this.battle.player))
            this.end("You left the Laplace zone")
    }

    public override snapshot() {
        const state = {
            active: this.active,
            clone: this.clone,
            center: { ...this.center },
            deceived: new Set(this.deceived),
            ledger: new Map(this.ledger),
            charge: this.charge.value,
        }
        return () => {
            this.active = state.active
            this.clone = state.clone
            this.center = { ...state.center }
            this.deceived = new Set(state.deceived)
            this.ledger = new Map(state.ledger)
            this.charge.value = state.charge
        }
    }

    public override reset() {
        this.dropClone()
        this.active = false
        this.deceived.clear()
        this.ledger.clear()
        this.charge.value = START_CHARGE
        this.battle.board.clearHighlight("zone")
    }

    // ---------- Internals ----------

    private inZone(tile: Tile) {
        return manhattan(tile, this.center) <= ZONE_RADIUS
    }

    /** Destroy the clone's display object (never during a simulation) */
    private dropClone() {
        if (this.clone && !this.clone.destroyed && !sim.dry)
            this.clone.destroy()
        this.clone = null
    }

    /** The clone fights like the player and can walk through the player */
    private planClone(): TurnPlan {
        const b = this.battle
        const clone = this.clone
        const alive = b.enemies.filter((e) => !e.isDead)
        if (!clone || alive.length === 0) return { path: [], attacks: [] }

        const enemy = alive.reduce((best, e) =>
            manhattan(clone, e) < manhattan(clone, best) ? e : best,
        )
        return planTurn(
            b.board,
            clone,
            clone.actions,
            enemy,
            enemy,
            (t) => b.hasEnemyAt(t) || !this.inZone(t),
            (t) => !b.isOccupied(t),
        )
    }

    private spawnClone() {
        const b = this.battle
        this.clone = new Clone(b.board, b.player)
        b.board.entityLayer.addChild(this.clone)
        this.deceived = new Set(
            b.enemies.filter((e) => !e.isDead && this.inZone(e)),
        )
        this.refreshView()
    }

    private loseClone(reason: string) {
        this.dropClone()
        this.deceived.clear()
        this.battle.say(reason)
    }

    private activate() {
        const b = this.battle
        this.charge.value -= ACTIVATION_COST
        this.active = true
        this.ledger.clear()
        this.center = { col: b.player.col, row: b.player.row }
        this.spawnClone()

        b.player.addStatus({ id: ZONE, name: "Laplace Demon", color: 0xa78bfa })
        b.board.highlight(
            "zone",
            b.board.tilesInRange(this.center, 0, ZONE_RADIUS),
            0xa78bfa,
            0.16,
        )
        b.say(
            this.deceived.size > 0
                ? "Enemies in the zone see only the clone."
                : "Nobody was inside the zone, no one is fooled.",
        )
    }

    private end(reason: string) {
        if (!this.active) return
        const b = this.battle
        this.active = false
        this.dropClone()
        this.deceived.clear()

        b.player.removeStatus(ZONE)
        if (!sim.dry) b.board.clearHighlight("zone")

        // Temporary damage is given back (a kill stays: dead enemies are skipped)
        for (const [enemy, amount] of this.ledger) {
            if (!enemy.isDead) enemy.heal(amount)
        }
        this.ledger.clear()
        b.say(reason)
    }

    public override previewTiles() {
        return this.battle.board.tilesInRange(this.center, 0, ZONE_RADIUS, true)
    }
}
