import type { Ability, Resource } from "./Ability"
import type { Action } from "./Actions"
import type { Battle } from "./Battle"
import type { Tile } from "./Board"
import { buildPath, manhattan } from "./Board"
import { Clone } from "./Clone"
import type { Entity } from "./Entity"

const STATUS_ID = "laplace"
const ZONE_RADIUS = 6
const MAX_CHARGE = 100
const START_CHARGE = 50
/** Paid on activation, then again at the start of every extra turn */
const TURN_COST = 20
/** Charge gained per turn while the ability is off */
const REGEN = 10
/** Testing switch: allow attacks while invisible so you can see the HP revert */
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
    private active = false
    private foresight = false
    private clone: Clone | null = null
    private cloneMove: Tile[] = []
    private center: Tile = { col: 0, row: 0 }
    /** Damage dealt to each enemy during the ability (given back if it ends) */
    private ledger = new Map<Entity, number>()

    constructor(battle: Battle) {
        this.battle = battle

        this.actions = [
            {
                kind: "instant",
                id: "laplace",
                name: "Laplace",
                apCost: 2,
                subtitle: `${TURN_COST} charge`,
                unavailable: () =>
                    this.active
                        ? "Already active"
                        : this.charge.value < TURN_COST
                          ? "Not enough charge"
                          : null,
                run: () => this.activate(),
            },
            {
                kind: "instant",
                id: "foresight",
                name: "Foresight",
                apCost: 0,
                subtitle: "preview",
                requiresStatus: STATUS_ID,
                isOn: () => this.foresight,
                run: () => {
                    this.foresight = !this.foresight
                },
            },
            {
                kind: "instant",
                id: "dismiss",
                name: "Dismiss",
                apCost: 0,
                subtitle: "end ability",
                requiresStatus: STATUS_ID,
                run: () => this.end("Ability dismissed"),
            },
        ]
    }

    public get entities(): Entity[] {
        return this.clone ? [this.clone] : []
    }

    // ---------- Ability hooks ----------

    public perceivedTarget() {
        return this.active && this.clone && !this.clone.isDead
            ? this.clone
            : null
    }

    public plannedMoves() {
        const moves = new Map<Entity, Tile[]>()
        if (this.active && this.clone) moves.set(this.clone, this.cloneMove)
        return moves
    }

    public showsForecast() {
        return this.active && this.foresight
    }

    public isTileSafe(tile: Tile) {
        return !this.active || this.inZone(tile)
    }

    public blocksAction(action: Action) {
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

    public onTurnStart() {
        if (!this.active) {
            this.charge.value = Math.min(MAX_CHARGE, this.charge.value + REGEN)
            return
        }
        if (this.charge.value < TURN_COST) {
            this.end("Out of charge")
            return
        }
        this.charge.value -= TURN_COST
        const status = this.battle.player.statuses.get(STATUS_ID)
        if (status) status.turnsLeft = this.turnsLeft()
        this.planClone()
    }

    public async playTurn() {
        if (!this.active || !this.clone) return
        await this.clone.followPath(this.cloneMove)
        this.cloneMove = []
    }

    public check() {
        if (!this.active || this.battle.phase === "over") return
        if (this.clone?.isDead) return this.end("The clone was destroyed")
        if (!this.inZone(this.battle.player))
            return this.end("You left the Laplace zone")
        if (this.clone && !this.inZone(this.clone))
            return this.end("The clone left the zone")
    }

    public reset() {
        if (this.clone && !this.clone.destroyed) this.clone.destroy()
        this.clone = null
        this.cloneMove = []
        this.active = false
        this.foresight = false
        this.ledger.clear()
        this.charge.value = START_CHARGE
        this.battle.board.clearHighlight("zone")
    }

    // ---------- Internals ----------

    private turnsLeft() {
        return 1 + Math.floor(this.charge.value / TURN_COST)
    }

    private inZone(tile: Tile) {
        return manhattan(tile, this.center) <= ZONE_RADIUS
    }

    private activate() {
        const b = this.battle
        this.charge.value -= TURN_COST
        this.active = true
        this.foresight = false
        this.ledger.clear()
        this.center = { col: b.player.col, row: b.player.row }

        this.clone = new Clone(b.board, b.player)
        b.board.entityLayer.addChild(this.clone)

        b.player.setGhost(true)
        b.player.addStatus({
            id: STATUS_ID,
            name: "Laplace Demon",
            color: 0xa78bfa,
            turnsLeft: this.turnsLeft(),
        })

        b.board.highlight(
            "zone",
            b.board.tilesInRange(this.center, 0, ZONE_RADIUS),
            0xa78bfa,
            0.16,
        )
        this.planClone()
        b.say("You are invisible. Enemies see only the clone.")
    }

    /** The clone picks its random destination now, so the preview can show it */
    private planClone() {
        if (!this.clone) return
        const b = this.battle
        const found = b.board.getReachable(
            this.clone,
            this.clone.stats.maxMp,
            (t) => b.isOccupied(t) || !this.inZone(t),
        )
        const options = Array.from(found.values()).filter((n) => n.dist > 0)
        this.cloneMove =
            options.length > 0
                ? buildPath(options[Math.floor(Math.random() * options.length)])
                : []
    }

    private end(reason: string) {
        if (!this.active) return
        const b = this.battle
        this.active = false
        this.foresight = false

        if (this.clone && !this.clone.destroyed) this.clone.destroy()
        this.clone = null
        this.cloneMove = []

        b.player.setGhost(false)
        b.player.removeStatus(STATUS_ID)
        b.board.clearHighlight("zone")

        // Temporary damage is given back (a kill stays: dead enemies are skipped)
        for (const [enemy, amount] of this.ledger) {
            if (!enemy.isDead) enemy.heal(amount)
        }
        this.ledger.clear()
        b.say(reason)
    }
}
