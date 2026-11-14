import { combatLog, logHit } from "../ui/CombatLog"
import type { Board, PathNode, Tile } from "../world/Board"
import { buildPath, manhattan, tileKey } from "../world/Board"
import type { Entity } from "../world/Entity"

import type { AttackAction } from "./Actions"
import { computeDamage } from "./Actions"
import type { Script } from "./Script"
import { pause, record, sim } from "./Script"

export interface PlannedAttack {
    target: Entity
    action: AttackAction
}

export interface TurnPlan {
    path: Tile[]
    attacks: PlannedAttack[]
    /** Spend the turn refilling the magazine */
    reload?: { apCost: number }
    /** Walking to where the target was last seen (no attacks) */
    searching?: boolean
}

export interface PlanHooks {
    onDamage?: (target: Entity, dealt: number) => void
    /** Runs after a hit lands (pushes, effects...) */
    afterHit?: (target: Entity, action: AttackAction) => Script
    /** Damage is only temporary: lethal hits knock out instead of killing */
    temporary?: boolean
}

/** Strongest affordable attacks in range, repeated while AP and bullets last */
function pickAttacks(
    actions: AttackAction[],
    self: Entity,
    target: Entity,
    distance: number,
    canSee: boolean,
    apLeft: number,
): PlannedAttack[] {
    const usable = actions
        .filter(
            (a) =>
                distance >= a.minRange &&
                distance <= a.maxRange &&
                (a.needsSight === false || canSee),
        )
        .sort(
            (a, b) =>
                computeDamage(b, self, target) - computeDamage(a, self, target),
        )

    const attacks: PlannedAttack[] = []
    let ap = apLeft
    let ammo = self.stats.maxAmmo > 0 ? self.stats.ammo : Infinity
    for (;;) {
        const next = usable.find(
            (a) => a.apCost <= ap && (!a.usesAmmo || ammo > 0),
        )
        if (!next) break
        attacks.push({ target, action: next })
        ap -= next.apCost
        if (next.usesAmmo) ammo--
    }
    return attacks
}

/**
 * Pick the reachable tile that allows the most damage. Ties go to fewer steps.
 * If no attack is possible, get as close as possible by real walking distance.
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

/** Walk as close as possible to a tile (used when searching). No attacks. */
export function planWalk(
    board: Board,
    self: Entity,
    to: Tile,
    isBlocked: (tile: Tile) => boolean,
): TurnPlan {
    const reachable = board.getReachable(self, self.stats.maxAp, isBlocked)
    const walkTo = board.getReachable(to, 99, () => false)

    let best: PathNode | null = null
    let bestWalk = Infinity
    for (const node of reachable.values()) {
        const walk = walkTo.get(tileKey(node))?.dist ?? Infinity
        if (
            !best ||
            walk < bestWalk ||
            (walk === bestWalk && node.dist < best.dist)
        ) {
            best = node
            bestWalk = walk
        }
    }
    return { path: best ? buildPath(best) : [], attacks: [], searching: true }
}

export function* executePlan(
    self: Entity,
    plan: TurnPlan,
    hooks: PlanHooks = {},
): Script {
    self.startTurn()

    if (plan.reload) {
        self.spendAp(plan.reload.apCost)
        self.stats.ammo = self.stats.maxAmmo
        record({
            kind: "idle",
            actor: self,
            at: { col: self.col, row: self.row },
            reason: "reloads",
        })
        combatLog.add(`${self.displayName} reloads`, 0x94a3b8)
        if (!sim.dry) self.showFloatingText("Reload", 0x94a3b8, 24)
        yield* pause(500)
    }

    if (plan.path.length > 0) {
        record({
            kind: "move",
            actor: self,
            from: { col: self.col, row: self.row },
            path: plan.path,
        })
    }
    yield self.followPath(plan.path)

    for (const { target, action } of plan.attacks) {
        if (self.isOut || target.isOut) break
        // The target may have been pushed away by an earlier hit
        if (!self.canHit(target, action)) break

        self.spendAp(action.apCost)
        if (action.usesAmmo && self.stats.maxAmmo > 0) {
            self.stats.ammo = Math.max(0, self.stats.ammo - 1)
        }
        const damage = computeDamage(action, self, target)
        const dealt = Math.min(damage, target.stats.hp)
        record({
            kind: "attack",
            actor: self,
            target,
            from: { col: self.col, row: self.row },
            to: { col: target.col, row: target.row },
            damage,
            kills: damage >= target.stats.hp,
            temp: !!hooks.temporary,
        })
        yield target.takeDamage(damage, hooks.temporary)
        logHit(self, target, action, dealt, !!hooks.temporary)
        hooks.onDamage?.(target, dealt)
        if (hooks.afterHit) yield* hooks.afterHit(target, action)
    }
}
