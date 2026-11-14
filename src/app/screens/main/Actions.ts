import type { Entity } from "./Entity"
import type { IconKind } from "./Icons"

interface ActionBase {
    id: string
    name: string
    apCost: number
    /** The card only appears while the player has this status */
    requiresStatus?: string
    forbidsStatus?: string
    /** Extra rule: return a reason when unusable, or null when fine */
    unavailable?: () => string | null
    visible?: () => boolean
    /** Tab the card lives in. Defaults to "Combat". */
    group?: string
    /** Longer text for the tooltip */
    description?: string
    /** Optional icon from Icons.ts. Without one the card shows a letter badge. */
    icon?: IconKind
}

/** Pick a target on the board within range */
export interface AttackAction extends ActionBase {
    kind: "attack"
    minRange: number
    maxRange: number
    baseDamage: number
    push?: number
    subtitle?: string
}

/** Runs immediately when clicked */
export interface InstantAction extends ActionBase {
    kind: "instant"
    /** Small text under the name on the card */
    subtitle?: string
    /** For toggles: is it currently on? */
    isOn?: () => boolean
    run: () => void
}

export type Action = AttackAction | InstantAction

export const PLAYER_ACTIONS: AttackAction[] = [
    {
        kind: "attack",
        id: "punch",
        name: "Punch",
        apCost: 3,
        minRange: 1,
        maxRange: 1,
        baseDamage: 15,
    },
    {
        kind: "attack",
        id: "kick",
        name: "Long Kick",
        apCost: 4,
        minRange: 1,
        maxRange: 2,
        baseDamage: 20,
    },
    {
        kind: "attack",
        id: "rock",
        name: "Throw Rock",
        apCost: 2,
        minRange: 3,
        maxRange: 8,
        baseDamage: 5,
    },
]

export function computeDamage(
    action: AttackAction,
    attacker: Entity,
    target?: Entity,
) {
    const raw =
        (action.baseDamage / 10) *
        attacker.stats.damage *
        attacker.damageDealtMultiplier()
    return Math.max(1, Math.round(raw * (target?.damageTakenMultiplier() ?? 1)))
}

export const GROUP_COLORS: Record<string, number> = {
    Combat: 0xef4444,
    Nen: 0x22c55e,
    Senses: 0x38bdf8,
}
export const groupColor = (group?: string) =>
    GROUP_COLORS[group ?? "Combat"] ?? 0x94a3b8

/** Tooltip text. Attacks describe themselves, others use `description` or `subtitle`. */
export function describeAction(a: Action) {
    if (a.description) return a.description
    if (a.kind === "attack") {
        const range =
            a.minRange === a.maxRange
                ? `${a.maxRange}`
                : `${a.minRange}-${a.maxRange}`
        return `Range ${range}  ·  base damage ${a.baseDamage}${a.push ? `  ·  pushes ${a.push}` : ""}`
    }
    return a.subtitle ?? ""
}
