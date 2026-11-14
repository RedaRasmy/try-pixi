import type { AttackAction } from "../core/Actions"

export interface EnemyDef {
    name: string
    color: number
    hp: number
    ap: number
    damage: number
    /** Sees through illusions when the real player is this close (tiles) */
    senseRadius?: number
    attacks: AttackAction[]
    /** Permanent Nen statuses (see Nen.ts), e.g. ["zetsu"] */
    nen?: string[]
}

const hit = (
    id: string,
    name: string,
    apCost: number,
    minRange: number,
    maxRange: number,
    baseDamage: number,
    push?: number,
): AttackAction => ({
    kind: "attack",
    id,
    name,
    apCost,
    minRange,
    maxRange,
    baseDamage,
    push,
})

export const ENEMY_TYPES = {
    dummy: {
        name: "Dummy",
        color: 0xef4444,
        hp: 45,
        ap: 6,
        damage: 6,
        attacks: [
            hit("smack", "Smack", 3, 1, 1, 15),
            hit("spit", "Spit", 2, 2, 4, 7),
        ],
    },
    hunter: {
        name: "Hunter",
        color: 0xa855f7,
        hp: 40,
        ap: 7,
        damage: 10,
        senseRadius: 3,
        attacks: [
            hit("slash", "Slash", 3, 1, 1, 8),
            hit("needle", "Needle", 2, 2, 4, 5),
        ],
    },
    brute: {
        name: "Brute",
        color: 0xf97316,
        hp: 80,
        ap: 6,
        damage: 10,
        attacks: [hit("charge", "Charge", 3, 1, 1, 12, 2)],
    },
    sniper: {
        name: "Sniper",
        color: 0x0ea5e9,
        hp: 60,
        ap: 6,
        damage: 10,
        attacks: [hit("snipe", "Snipe", 5, 3, 20, 40)],
    },
    stalker: {
        name: "Stalker",
        color: 0x14b8a6,
        hp: 35,
        ap: 8,
        damage: 12,
        nen: ["zetsu"],
        attacks: [
            hit("stab", "Stab", 3, 1, 1, 14),
            hit("knife", "Knife", 2, 2, 3, 8),
        ],
    },
} satisfies Record<string, EnemyDef>

export type EnemyType = keyof typeof ENEMY_TYPES
