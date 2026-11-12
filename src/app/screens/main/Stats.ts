export interface Stats {
    maxHp: number
    hp: number
    maxAp: number
    ap: number
    maxMp: number
    mp: number
    /** Bonus added to the base damage of every attack */
    damage: number
}

export function createStats(o: {
    hp: number
    ap: number
    mp: number
    damage: number
}): Stats {
    return {
        maxHp: o.hp,
        hp: o.hp,
        maxAp: o.ap,
        ap: o.ap,
        maxMp: o.mp,
        mp: o.mp,
        damage: o.damage,
    }
}
