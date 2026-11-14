export interface Stats {
    maxHp: number
    hp: number
    maxAp: number
    ap: number
    /** Base damage multiplier source for every attack */
    damage: number
    /** Magazine. maxAmmo 0 = no ammo system */
    ammo: number
    maxAmmo: number
}

export function createStats(o: {
    hp: number
    ap: number
    damage: number
    ammo?: number
}): Stats {
    const ammo = o.ammo ?? 0
    return {
        maxHp: o.hp,
        hp: o.hp,
        maxAp: o.ap,
        ap: o.ap,
        damage: o.damage,
        ammo,
        maxAmmo: ammo,
    }
}
