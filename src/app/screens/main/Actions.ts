import type { IconKind } from "./Icons"
import type { Stats } from "./Stats"

export interface Action {
    id: string
    name: string
    icon: IconKind
    apCost: number
    minRange: number
    maxRange: number
    baseDamage: number
}

export const PLAYER_ACTIONS: Action[] = [
    {
        id: "jab",
        name: "Jab",
        icon: "jab",
        apCost: 1,
        minRange: 1,
        maxRange: 1,
        baseDamage: 4,
    },
    {
        id: "punch",
        name: "Punch",
        icon: "fist",
        apCost: 3,
        minRange: 1,
        maxRange: 1,
        baseDamage: 10,
    },
    {
        id: "kick",
        name: "Long Kick",
        icon: "kick",
        apCost: 4,
        minRange: 1,
        maxRange: 2,
        baseDamage: 14,
    },
    {
        id: "rock",
        name: "Throw Rock",
        icon: "rock",
        apCost: 2,
        minRange: 2,
        maxRange: 7,
        baseDamage: 2,
    },
]

/** Final damage = action's base damage + attacker's damage stat */
export function computeDamage(action: Action, attacker: Stats) {
    return action.baseDamage + attacker.damage
}
