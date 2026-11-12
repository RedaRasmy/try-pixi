import type { Board, Tile } from "./Board"
import { buildPath } from "./Board"
import { Entity } from "./Entity"
import { createStats } from "./Stats"

export class Enemy extends Entity {
    /** false = completely static dummy that just passes its turn */
    private wanders: boolean

    constructor(board: Board, col: number, row: number, wanders = true) {
        super(board, {
            name: "Dummy",
            col,
            row,
            color: 0xef4444,
            stats: createStats({ hp: 45, ap: 6, mp: 3, damage: 2 }),
        })
        this.wanders = wanders
    }

    /** Simple "AI": walk to a random reachable tile, or do nothing */
    public async takeTurn(isBlocked: (tile: Tile) => void | boolean) {
        this.startTurn()
        if (!this.wanders) return

        const found = this.board.getReachable(
            this,
            this.stats.mp,
            (t) => !!isBlocked(t),
        )
        const options = Array.from(found.values()).filter((n) => n.dist > 0)
        if (options.length === 0) return

        const target = options[Math.floor(Math.random() * options.length)]
        await this.followPath(buildPath(target))
    }
}
