import type { Stats } from "./Stats"

interface ActionBase {
    id: string
    name: string
    apCost: number
    /** The card only appears while the player has this status */
    requiresStatus?: string
    /** Extra rule: return a reason when unusable, or null when fine */
    unavailable?: () => string | null
}

/** Pick a target on the board within range */
export interface AttackAction extends ActionBase {
    kind: "attack"
    minRange: number
    maxRange: number
    baseDamage: number
}

/** Runs immediately when clicked */
export interface InstantAction extends ActionBase {
    kind: "instant"
    /** Small text under the name on the card */
    subtitle: string
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

export function computeDamage(action: AttackAction, attacker: Stats) {
    return Math.round((action.baseDamage / 10) * attacker.damage)
}
