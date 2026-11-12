import type { Stats } from "./Stats"

export interface Action {
    id: string
    name: string
    apCost: number
    minRange: number
    maxRange: number
    baseDamage: number
}

export const PLAYER_ACTIONS: Action[] = [
    {
        id: "punch",
        name: "Punch",
        apCost: 3,
        minRange: 1,
        maxRange: 1,
        baseDamage: 15,
    },
    {
        id: "kick",
        name: "Long Kick",
        apCost: 4,
        minRange: 1,
        maxRange: 2,
        baseDamage: 20,
    },
    {
        id: "rock",
        name: "Throw Rock",
        apCost: 2,
        minRange: 3,
        maxRange: 8,
        baseDamage: 5,
    },
]

/** Final damage = action's base damage + attacker's damage stat */
export function computeDamage(action: Action, attacker: Stats) {
    return Math.round((action.baseDamage / 10) * attacker.damage)
}
