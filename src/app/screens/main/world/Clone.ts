import type { AttackAction } from "../core/Actions"
import type { Board } from "./Board"
import { Entity } from "./Entity"
import type { Status } from "../core/Status"
import type { Player } from "./Player"

/** A copy of the player: same stats, actions and (live) status multipliers */
export class Clone extends Entity {
    public readonly actions: AttackAction[]
    private source: Player

    constructor(board: Board, owner: Player) {
        super(board, {
            name: "Clone",
            col: owner.col,
            row: owner.row,
            color: 0x93c5fd,
            stats: { ...owner.stats, ap: owner.stats.maxAp },
        })
        this.source = owner
        this.actions = owner.actions
    }

    public override statusList(): Status[] {
        return this.source.statusList()
    }
}
