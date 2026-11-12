import type { AttackAction } from "./Actions"
import { computeDamage } from "./Actions"
import type { Board, PathNode, Tile } from "./Board"
import { buildPath, manhattan } from "./Board"
import { Entity } from "./Entity"
import { createStats } from "./Stats"

export interface TurnPlan {
    path: Tile[]
    attack: { target: Entity; action: AttackAction } | null
}

const SMACK: AttackAction = {
    kind: "attack",
    id: "smack",
    name: "Smack",
    apCost: 3,
    minRange: 1,
    maxRange: 1,
    baseDamage: 15,
}

export class Enemy extends Entity {
    /** false = static dummy that just passes its turn */
    private aggressive: boolean

    constructor(board: Board, col: number, row: number, aggressive = true) {
        super(board, {
            name: "Dummy",
            col,
            row,
            color: 0xef4444,
            stats: createStats({ hp: 45, ap: 3, mp: 3, damage: 6 }),
        })
        this.aggressive = aggressive
    }

    /**
     * Decide the turn without doing anything. Deterministic, so the preview
     * shows exactly what will happen. `targetTile` is where the target will
     * stand when this enemy acts.
     */
    public plan(
        target: Entity,
        targetTile: Tile,
        isBlocked: (tile: Tile) => boolean,
    ): TurnPlan {
        if (!this.aggressive) return { path: [], attack: null }

        const reachable = this.board.getReachable(
            this,
            this.stats.maxMp,
            isBlocked,
        )
        let best: PathNode | null = null
        let bestDistance = Infinity
        for (const node of reachable.values()) {
            const d = manhattan(node, targetTile)
            if (
                d < bestDistance ||
                (d === bestDistance && best && node.dist < best.dist)
            ) {
                best = node
                bestDistance = d
            }
        }
        if (!best) return { path: [], attack: null }

        const inRange =
            bestDistance >= SMACK.minRange && bestDistance <= SMACK.maxRange
        const canPay = this.stats.maxAp >= SMACK.apCost
        return {
            path: buildPath(best),
            attack: inRange && canPay ? { target, action: SMACK } : null,
        }
    }

    public async execute(plan: TurnPlan) {
        this.startTurn()
        await this.followPath(plan.path)
        if (!plan.attack || plan.attack.target.isDead) return

        this.spendAp(plan.attack.action.apCost)
        await plan.attack.target.takeDamage(
            computeDamage(plan.attack.action, this.stats),
        )
    }
}
