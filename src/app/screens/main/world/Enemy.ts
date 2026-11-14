import type { Board, Tile } from "./Board"
import { ENEMY_TYPES } from "../data/Enemies"
import type { EnemyDef, EnemyType } from "../data/Enemies"
import { Entity } from "./Entity"
import { EN, makeStatus } from "../abilities/Nen"
import type { PlanHooks, TurnPlan } from "../core/Planner"
import { executePlan, planTurn } from "../core/Planner"
import type { Script } from "../core/Script"
import { createStats } from "../core/Stats"

export class Enemy extends Entity {
    private def: EnemyDef

    constructor(
        board: Board,
        col: number,
        row: number,
        type: EnemyType = "dummy",
    ) {
        const def: EnemyDef = ENEMY_TYPES[type]
        super(board, {
            name: def.name,
            col,
            row,
            color: def.color,
            stats: createStats({ hp: def.hp, ap: def.ap, damage: def.damage }),
        })
        this.def = def

        // Enemies use the same Nen statuses as the player (permanent ones)
        for (const id of def.nen ?? []) this.addStatus(makeStatus(id, true))
        if (def.senseRadius) {
            this.addStatus({
                ...makeStatus(EN, true),
                sense: def.senseRadius,
                name: `En (${def.senseRadius})`,
            })
        }
    }

    /** Decide the turn without doing anything */
    public plan(
        target: Entity,
        targetTile: Tile,
        isBlocked: (tile: Tile) => boolean,
    ): TurnPlan {
        return planTurn(
            this.board,
            this,
            this.def.attacks,
            target,
            targetTile,
            isBlocked,
        )
    }

    public execute(plan: TurnPlan, hooks?: PlanHooks): Script {
        return executePlan(this, plan, hooks)
    }
}
