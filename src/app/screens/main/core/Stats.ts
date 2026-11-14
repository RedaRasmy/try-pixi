export interface Stats {
    maxHp: number
    hp: number
    maxAp: number
    ap: number
    /** Base damage multiplier source for every attack */
    damage: number
}

export function createStats(o: {
    hp: number
    ap: number
    damage: number
}): Stats {
    return { maxHp: o.hp, hp: o.hp, maxAp: o.ap, ap: o.ap, damage: o.damage }
}
