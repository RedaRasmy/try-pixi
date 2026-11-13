import type { Board, Tile } from "./Board"
import { ENEMY_TYPES } from "./Enemies"
import type { EnemyDef, EnemyType } from "./Enemies"
import { Entity } from "./Entity"
import type { PlanHooks, TurnPlan } from "./Planner"
import { executePlan, planTurn } from "./Planner"
import { createStats } from "./Stats"

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

        if (def.senseRadius) {
            this.baseSense = def.senseRadius
            this.addStatus({
                id: "en",
                name: `En (senses within ${def.senseRadius})`,
                color: 0xa855f7,
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

    public execute(plan: TurnPlan, hooks?: PlanHooks) {
        return executePlan(this, plan, hooks)
    }
}
