import type { Board } from "./Board"
import { Entity } from "./Entity"
import { createStats } from "./Stats"

/** The decoy created by Laplace Demon */
export class Clone extends Entity {
    constructor(board: Board, owner: Entity) {
        super(board, {
            name: "Clone",
            col: owner.col,
            row: owner.row,
            color: 0x93c5fd,
            stats: createStats({ hp: owner.stats.hp, ap: 0, mp: 3, damage: 0 }),
        })
    }
}
