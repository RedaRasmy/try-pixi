import type { AttackAction } from "./Actions"
import { computeDamage } from "./Actions"
import type { Board, PathNode, Tile } from "./Board"
import { buildPath, manhattan, tileKey } from "./Board"
import type { Entity } from "./Entity"

export interface PlannedAttack {
    target: Entity
    action: AttackAction
}

export interface TurnPlan {
    path: Tile[]
    attacks: PlannedAttack[]
}

export interface PlanHooks {
    onDamage?: (target: Entity, dealt: number) => void
    /** Runs after a hit lands (pushes, effects...) */
    afterHit?: (target: Entity, action: AttackAction) => Promise<void>
}

function pickAttacks(
    actions: AttackAction[],
    self: Entity,
    target: Entity,
    distance: number,
    canSee: boolean,
    apLeft: number,
): PlannedAttack[] {
    if (!canSee) return []
    const usable = actions
        .filter((a) => distance >= a.minRange && distance <= a.maxRange)
        .sort(
            (a, b) =>
                computeDamage(b, self, target) - computeDamage(a, self, target),
        )

    const attacks: PlannedAttack[] = []
    let ap = apLeft
    for (;;) {
        const next = usable.find((a) => a.apCost <= ap)
        if (!next) break
        attacks.push({ target, action: next })
        ap -= next.apCost
    }
    return attacks
}

/**
 * Pick the reachable tile that allows the most damage. Ties go to fewer steps.
 * If no attack is possible, get as close as possible by real walking distance.
 * `canStop` lets the mover walk through some tiles without ending on them.
 */
export function planTurn(
    board: Board,
    self: Entity,
    actions: AttackAction[],
    target: Entity,
    targetTile: Tile,
    isBlocked: (tile: Tile) => boolean,
    canStop?: (tile: Tile) => boolean,
): TurnPlan {
    const budget = self.stats.maxAp
    const reachable = board.getReachable(self, budget, isBlocked, canStop)
    const walkToTarget = board.getReachable(targetTile, 99, () => false)

    let best: PathNode | null = null
    let bestAttacks: PlannedAttack[] = []
    let bestDamage = -1
    let bestWalk = Infinity

    for (const node of reachable.values()) {
        const distance = manhattan(node, targetTile)
        const canSee = board.hasLineOfSight(node, targetTile)
        const attacks = pickAttacks(
            actions,
            self,
            target,
            distance,
            canSee,
            budget - node.dist,
        )
        const damage = attacks.reduce(
            (sum, a) => sum + computeDamage(a.action, self, target),
            0,
        )
        const walk = walkToTarget.get(tileKey(node))?.dist ?? Infinity

        let better = false
        if (!best || damage > bestDamage) {
            better = true
        } else if (damage === bestDamage) {
            better =
                damage > 0
                    ? node.dist < best.dist
                    : walk < bestWalk ||
                      (walk === bestWalk && node.dist < best.dist)
        }

        if (better) {
            best = node
            bestAttacks = attacks
            bestDamage = damage
            bestWalk = walk
        }
    }

    if (!best) return { path: [], attacks: [] }
    return { path: buildPath(best), attacks: bestAttacks }
}

export async function executePlan(
    self: Entity,
    plan: TurnPlan,
    hooks: PlanHooks = {},
) {
    self.startTurn()
    await self.followPath(plan.path)

    for (const { target, action } of plan.attacks) {
        if (self.isDead || target.isDead) break
        // The target may have been pushed away by an earlier hit
        if (!self.canHit(target, action)) break

        self.spendAp(action.apCost)
        const dealt = await target.takeDamage(
            computeDamage(action, self, target),
        )
        hooks.onDamage?.(target, dealt)
        await hooks.afterHit?.(target, action)
    }
}
