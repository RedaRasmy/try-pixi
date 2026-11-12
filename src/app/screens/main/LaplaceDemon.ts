import type { Ability, Resource } from "./Ability"
import type { Action } from "./Actions"
import type { Battle } from "./Battle"
import { manhattan } from "./Board"
import { Clone } from "./Clone"
import type { Entity } from "./Entity"
import { executePlan, planTurn } from "./Planner"
import type { TurnPlan } from "./Planner"
import { ZETSU } from "./Nen"
const EYES = "closed-eyes"
const ZONE = "laplace"

const ZONE_RADIUS = 6
const MAX_CHARGE = 100
const START_CHARGE = 50
const ACTIVATION_COST = 20
/** Charge gained per turn while the ability is off */
const REGEN = 10
/** Testing switch: allow attacks while invisible */
const ALLOW_ATTACKS_WHILE_ACTIVE = false

export class LaplaceDemon implements Ability {
    public readonly charge: Resource = {
        id: "laplace-charge",
        name: "Laplace charge",
        color: 0xa78bfa,
        value: START_CHARGE,
        max: MAX_CHARGE,
    }
    public readonly resources = [this.charge]
    public readonly actions: Action[]

    private battle: Battle
    private eyesClosed = false
    private active = false
    private clone: Clone | null = null
    private center = { col: 0, row: 0 }
    /** Enemies that were inside the zone on activation and still believe the clone */
    private deceived = new Set<Entity>()
    /** Damage dealt to each enemy during the ability (given back if it ends) */
    private ledger = new Map<Entity, number>()

    constructor(battle: Battle) {
        this.battle = battle

        this.actions = [
            // {
            //     kind: "instant",
            //     id: "zetsu-on",
            //     name: "Zetsu",
            //     subtitle: "hide presence",
            //     apCost: 3,
            //     forbidsStatus: ZETSU,
            //     run: () => {
            //         this.zetsu = true
            //         this.battle.player.addStatus({
            //             id: ZETSU,
            //             name: "Zetsu",
            //             color: 0x43eb34,
            //         })
            //     },
            // },
            {
                kind: "instant",
                id: "close-eyes",
                name: "Close Eyes",
                subtitle: this.active ? "preview" : `${ACTIVATION_COST} charge`,
                apCost: 1,
                forbidsStatus: EYES,
                unavailable: () => {
                    if (!this.battle.player.hasStatus(ZETSU))
                        return "Needs Zetsu first"
                    if (!this.active && this.charge.value < ACTIVATION_COST) {
                        return "Not enough charge"
                    }
                    return null
                },
                run: () => {
                    this.eyesClosed = true
                    this.battle.player.addStatus({
                        id: EYES,
                        name: "Closed Eyes",
                        color: 0x64748b,
                    })
                    if (!this.active) this.activate()
                },
            },
            {
                kind: "instant",
                id: "open-eyes",
                name: "Open Eyes",
                subtitle: "end preview",
                apCost: 1,
                requiresStatus: EYES,
                run: () => this.openEyes(),
            },
            // {
            //     kind: "instant",
            //     id: "zetsu-off",
            //     name: "Zetsu Off",
            //     subtitle: "end ability",
            //     apCost: 1,
            //     requiresStatus: ZETSU,
            //     run: () => {
            //         this.zetsu = false
            //         this.battle.player.removeStatus(ZETSU)
            //         this.end("Zetsu released")
            //     },
            // },
        ]
    }

    public get entities(): Entity[] {
        return this.clone ? [this.clone] : []
    }

    // ---------- Ability hooks ----------

    public perceivedTarget(viewer: Entity) {
        if (!this.active || !this.clone || this.clone.isDead) return null
        return this.deceived.has(viewer) ? this.clone : null
    }

    public plannedTurns() {
        if (!this.active || !this.clone) return []
        return [{ entity: this.clone, plan: this.planClone() }]
    }

    public showsForecast() {
        return this.active && this.eyesClosed
    }

    public visibleTiles() {
        if (!this.active || !this.eyesClosed) return null
        return this.battle.board.tilesInRange(this.center, 0, ZONE_RADIUS)
    }

    public blocksMovement() {
        return this.eyesClosed ? "Your eyes are closed" : null
    }

    public isTileSafe(tile: { col: number; row: number }) {
        return !this.active || this.inZone(tile)
    }

    public blocksAction(action: Action) {
        if (this.eyesClosed && action.id !== "open-eyes") {
            return "Your eyes are closed"
        }
        if (
            this.active &&
            action.kind === "attack" &&
            !ALLOW_ATTACKS_WHILE_ACTIVE
        ) {
            return "Can't attack while invisible"
        }
        return null
    }

    public onDamageDealt(target: Entity, amount: number) {
        if (!this.active) return
        this.ledger.set(target, (this.ledger.get(target) ?? 0) + amount)
    }

    public onTurnEnd() {
        if (this.eyesClosed) this.openEyes()
    }

    public onTurnStart() {
        if (!this.active) {
            this.charge.value = Math.min(MAX_CHARGE, this.charge.value + REGEN)
        }
    }

    public async playTurn() {
        if (!this.active || !this.clone) return
        await executePlan(this.clone, this.planClone(), (target, dealt) =>
            this.onDamageDealt(target, dealt),
        )
    }

    public check() {
        if (!this.active || this.battle.phase === "over") return

        if (!this.battle.player.hasStatus(ZETSU))
            return this.end("Zetsu released")

        for (const enemy of [...this.deceived]) {
            if (enemy.isDead) {
                this.deceived.delete(enemy)
            } else if (!this.inZone(enemy)) {
                this.deceived.delete(enemy)
                this.battle.say(`${enemy.displayName} saw through the illusion`)
            }
        }

        if (this.clone?.isDead) return this.end("The clone was destroyed")
        if (!this.inZone(this.battle.player)) {
            return this.end("You left the Laplace zone")
        }
    }

    public reset() {
        if (this.clone && !this.clone.destroyed) this.clone.destroy()
        this.clone = null
        this.active = false
        this.eyesClosed = false
        this.deceived.clear()
        this.ledger.clear()
        this.charge.value = START_CHARGE
        this.battle.board.clearHighlight("zone")
        this.battle.board.setFog(null)
    }

    // ---------- Internals ----------

    private inZone(tile: { col: number; row: number }) {
        return manhattan(tile, this.center) <= ZONE_RADIUS
    }

    /** The clone fights like the player: walk toward the nearest enemy, then attack */
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
            (t) => b.isOccupied(t) || !this.inZone(t),
        )
    }

    private openEyes() {
        this.eyesClosed = false
        this.battle.player.removeStatus(EYES)
    }

    private activate() {
        const b = this.battle
        this.charge.value -= ACTIVATION_COST
        this.active = true
        this.ledger.clear()
        this.center = { col: b.player.col, row: b.player.row }

        this.clone = new Clone(b.board, b.player)
        b.board.entityLayer.addChild(this.clone)

        // Only enemies inside the zone right now can be fooled
        this.deceived = new Set(
            b.enemies.filter((e) => !e.isDead && this.inZone(e)),
        )

        b.player.setGhost(true)
        b.player.addStatus({ id: ZONE, name: "Laplace Demon", color: 0xa78bfa })

        b.board.highlight(
            "zone",
            b.board.tilesInRange(this.center, 0, ZONE_RADIUS),
            0xa78bfa,
            0.16,
        )
        b.say(
            this.deceived.size > 0
                ? "You are invisible. Enemies in the zone see only the clone."
                : "Nobody was inside the zone, no one is fooled.",
        )
    }

    private end(reason: string) {
        if (!this.active) return
        const b = this.battle
        this.active = false
        this.eyesClosed = false

        if (this.clone && !this.clone.destroyed) this.clone.destroy()
        this.clone = null
        this.deceived.clear()

        b.player.setGhost(false)
        b.player.removeStatus(ZONE)
        b.player.removeStatus(EYES)
        b.board.clearHighlight("zone")

        // Temporary damage is given back (a kill stays: dead enemies are skipped)
        for (const [enemy, amount] of this.ledger) {
            if (!enemy.isDead) enemy.heal(amount)
        }
        this.ledger.clear()
        b.say(reason)
    }
}
