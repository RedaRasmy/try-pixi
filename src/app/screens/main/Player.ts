import { PLAYER_ACTIONS } from "./Actions"
import type { Board } from "./Board"
import { Entity } from "./Entity"
import { createStats } from "./Stats"

export class Player extends Entity {
    public readonly actions = PLAYER_ACTIONS

    constructor(board: Board, col: number, row: number) {
        super(board, {
            name: "Player",
            col,
            row,
            color: 0x3b82f6,
            stats: createStats({ hp: 50, ap: 10, damage: 3 }),
        })
    }
}
