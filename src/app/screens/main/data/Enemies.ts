import type { AttackAction } from "../core/Actions"

export interface EnemyDef {
    name: string
    color: number
    hp: number
    ap: number
    damage: number
    attacks: AttackAction[]
    /** Bullets per magazine. Needs reloadCost too. */
    magazine?: number
    reloadCost?: number
    /** Permanent Nen statuses (see Nen.ts), e.g. ["zetsu"]. Soldiers have none. */
    nen?: string[]
}

const SHOOT: AttackAction = {
    id: "shoot",
    name: "Shoot",
    apCost: 3,
    minRange: 2,
    maxRange: 8,
    // 13 -> 4 hits kill the player, 3 with En (x1.5), 2 with Zetsu (x2)
    baseDamage: 13,
    usesAmmo: true,
}

export const ENEMY_TYPES = {
    soldier: {
        name: "Soldier",
        color: 0x6b8e23,
        hp: 40,
        ap: 6,
        damage: 10,
        magazine: 6,
        reloadCost: 5,
        attacks: [SHOOT],
    },
} satisfies Record<string, EnemyDef>

export type EnemyType = keyof typeof ENEMY_TYPES
