import type { AttackAction } from "./Actions"
import type { Board, Tile } from "./Board"
import { Entity } from "./Entity"
import type { TurnPlan } from "./Planner"
import { executePlan, planTurn } from "./Planner"
import { createStats } from "./Stats"

const SMACK: AttackAction = {
    kind: "attack",
    id: "smack",
    name: "Smack",
    apCost: 3,
    minRange: 1,
    maxRange: 1,
    baseDamage: 15,
}

/** Weaker, but from a distance */
const SPIT: AttackAction = {
    kind: "attack",
    id: "spit",
    name: "Spit",
    apCost: 2,
    minRange: 2,
    maxRange: 4,
    baseDamage: 7,
}

export class Enemy extends Entity {
    private aggressive: boolean

    constructor(board: Board, col: number, row: number, aggressive = true) {
        super(board, {
            name: "Dummy",
            col,
            row,
            color: 0xef4444,
            stats: createStats({ hp: 45, ap: 6, damage: 6 }),
        })
        this.aggressive = aggressive
    }

    /** Decide the turn without doing anything */
    public plan(
        target: Entity,
        targetTile: Tile,
        isBlocked: (tile: Tile) => boolean,
    ): TurnPlan {
        if (!this.aggressive) return { path: [], attacks: [] }
        return planTurn(
            this.board,
            this,
            [SMACK, SPIT],
            target,
            targetTile,
            isBlocked,
        )
    }

    public execute(plan: TurnPlan) {
        return executePlan(this, plan)
    }
}
