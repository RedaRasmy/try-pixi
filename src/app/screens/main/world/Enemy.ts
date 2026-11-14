import { makeStatus } from "../abilities/Nen"
import type { PlanHooks, TurnPlan } from "../core/Planner"
import { executePlan, planTurn, planWalk } from "../core/Planner"
import type { Script } from "../core/Script"
import { createStats } from "../core/Stats"
import { ENEMY_TYPES } from "../data/Enemies"
import type { EnemyDef, EnemyType } from "../data/Enemies"
import { combatLog } from "../ui/CombatLog"

import type { Board, Tile } from "./Board"
import { Entity } from "./Entity"

export class Enemy extends Entity {
    private def: EnemyDef
    /** Where it last saw (or believed it saw) you. null = unaware. */
    public lastKnown: Tile | null = null

    constructor(
        board: Board,
        col: number,
        row: number,
        type: EnemyType = "soldier",
    ) {
        const def: EnemyDef = ENEMY_TYPES[type]
        super(board, {
            name: def.name,
            col,
            row,
            color: def.color,
            stats: createStats({
                hp: def.hp,
                ap: def.ap,
                damage: def.damage,
                ammo: def.magazine,
            }),
        })
        this.def = def
        for (const id of def.nen ?? []) this.addStatus(makeStatus(id, true))
    }

    /** Has noticed something and is hunting for it */
    public get alert() {
        return this.lastKnown !== null
    }

    /**
     * Decide the turn without doing anything. `target` is who it believes it sees
     * (null = nobody). Returns null when there is nothing to do.
     */
    public decide(
        target: Entity | null,
        isBlocked: (tile: Tile) => boolean,
    ): TurnPlan | null {
        if (target) {
            this.lastKnown = { col: target.col, row: target.row }

            const empty = this.stats.maxAmmo > 0 && this.stats.ammo <= 0
            if (empty && this.def.reloadCost !== undefined) {
                return {
                    path: [],
                    attacks: [],
                    reload: { apCost: this.def.reloadCost },
                }
            }
            return planTurn(
                this.board,
                this,
                this.def.attacks,
                target,
                target,
                isBlocked,
            )
        }

        // Lost sight: head for where it last saw you, not for where you are now
        if (!this.lastKnown) return null
        return planWalk(this.board, this, this.lastKnown, isBlocked)
    }

    public *execute(plan: TurnPlan, hooks?: PlanHooks): Script {
        yield* executePlan(this, plan, hooks)

        const k = this.lastKnown
        if (plan.searching && k && this.col === k.col && this.row === k.row) {
            this.lastKnown = null
            combatLog.add(`${this.displayName} gives up the search`, 0x94a3b8)
        }
    }

    /** The forecast restores everything, including what this enemy remembers */
    public override snapshot() {
        const restore = super.snapshot()
        const memory = this.lastKnown ? { ...this.lastKnown } : null
        return () => {
            restore()
            this.lastKnown = memory ? { ...memory } : null
        }
    }
}
