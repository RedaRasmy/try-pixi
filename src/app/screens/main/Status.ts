export interface Status {
    id: string
    name: string
    color: number
    /** Ticks down at the start of each of your turns, then it expires */
    turnsLeft?: number
    /** Multiplier on damage this entity deals */
    dealt?: number
    /** Multiplier on damage this entity takes (below 1 = resistance) */
    taken?: number
    /** Removed after the owner's next attack */
    consumeOnAttack?: boolean

    sense?: number
}
