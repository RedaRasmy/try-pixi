import type { Entity } from "../world/Entity"
import type { IconKind } from "../ui/Icons"

export interface Action {
    id: string
    name: string
    apCost: number
    /** Range 0 = targets yourself: select the action, then click your own tile */
    minRange: number
    maxRange: number
    /** false = ignores walls (default true) */
    needsSight?: boolean
    /** Set = hits an enemy for this much (before multipliers) */
    baseDamage?: number
    /** Tiles the target slides away from the attacker */
    push?: number
    /** Can be used with your eyes closed */
    blind?: boolean

    group?: string
    subtitle?: string
    description?: string
    icon?: IconKind

    requiresStatus?: string
    forbidsStatus?: string
    /** Hide the card when this returns false */
    visible?: () => boolean
    /** A reason it can't be used right now, or null */
    unavailable?: () => string | null
    /** For toggles: is it currently on? */
    isOn?: () => boolean
    /** The effect (self actions) */
    run?: () => void
    /** Physical attacks are boosted by Ren and Ko. Bullets and other objects are not. */
    physical?: boolean
    /** Entities with a magazine (soldiers): each use takes one bullet */
    usesAmmo?: boolean
}

export type AttackAction = Action & { baseDamage: number }

export const isSelfAction = (a: Action) => a.maxRange === 0

export const PLAYER_ACTIONS: AttackAction[] = [
    {
        id: "punch",
        name: "Punch",
        apCost: 3,
        minRange: 1,
        maxRange: 1,
        baseDamage: 15,
        physical: true,
    },
    {
        id: "kick",
        name: "Long Kick",
        apCost: 4,
        minRange: 1,
        maxRange: 2,
        baseDamage: 20,
        physical: true,
    },
]

/** Damage = base x attacker stat x (Ren/Ko, physical only) x target's multipliers */
export function computeDamage(
    action: Action,
    attacker: Entity,
    target?: Entity,
) {
    const boost = action.physical ? attacker.damageDealtMultiplier() : 1
    const raw = ((action.baseDamage ?? 0) / 10) * attacker.stats.damage * boost
    return Math.max(1, Math.round(raw * (target?.damageTakenMultiplier() ?? 1)))
}

export const GROUP_COLORS: Record<string, number> = {
    Combat: 0xef4444,
    Nen: 0x22c55e,
    Senses: 0x38bdf8,
}
export const groupColor = (group?: string) =>
    GROUP_COLORS[group ?? "Combat"] ?? 0x94a3b8

export function describeAction(a: Action) {
    if (a.description) return a.description
    if (isSelfAction(a)) return a.subtitle ?? ""
    const range =
        a.minRange === a.maxRange
            ? `${a.maxRange}`
            : `${a.minRange}-${a.maxRange}`
    const parts = [`Range ${range}`, `base damage ${a.baseDamage ?? 0}`]
    if (a.push) parts.push(`pushes ${a.push}`)
    if (a.needsSight === false) parts.push("ignores walls")
    parts.push(a.physical ? "physical (Ren/Ko apply)" : "not boosted by Ren/Ko")
    return parts.join("  ·  ")
}
