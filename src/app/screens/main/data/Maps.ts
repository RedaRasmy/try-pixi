import type { Battle } from "../Battle"
import type { Tile } from "../world/Board"
import type { EnemyType } from "./Enemies"

/** Screen side of the grid: nw = column -1, ne = row -1, se = column `cols`, sw = row `rows` */
export type Side = "nw" | "ne" | "se" | "sw"

/** Returns why the door is locked, or null if it can be used. `at` = the door tile. */
export type DoorCondition = (battle: Battle, at: Tile) => string | null

export interface ExitDef {
    id: string
    side: Side
    /** Position along that side (a row for nw/se, a column for ne/sw) */
    at: number
    to: { map: string; exit: string }
    requires?: DoorCondition[]
}

export interface MapDef {
    name: string
    /** '.' floor, '#' wall */
    layout: string[]
    playerStart: Tile
    enemies: { col: number; row: number; type: EnemyType }[]
    exits: ExitDef[]
}

// ---------- Door conditions: add your own here ----------

/** No living enemy has a straight line of sight to the door */
export const noLineOfSight: DoorCondition = (b, at) => {
    const seer = b.enemies.find(
        (e) => !e.isDead && b.board.hasLineOfSight(e, at),
    )
    return seer ? `${seer.displayName} can see the door` : null
}

/** Nobody perceives you there (Zetsu, walls and En all count) */
export const unseen: DoorCondition = (b, at) => {
    const seer = b.enemies.find((e) => !e.isDead && b.canPerceivePlayer(e, at))
    return seer ? `${seer.displayName} would notice you` : null
}

export const allEnemiesDead: DoorCondition = (b) =>
    b.enemies.every((e) => e.isDead) ? null : "Defeat everyone first"

export const needsStatus =
    (id: string, label: string): DoorCondition =>
    (b) =>
        b.player.hasStatus(id) ? null : `Needs ${label}`

// ---------- The maps ----------

export const START_MAP = "yard"

export const MAPS: Record<string, MapDef> = {
    yard: {
        name: "The Yard",
        layout: [
            "..........",
            "..#.......",
            "..#...##..",
            "..........",
            ".....#....",
            "..........",
            ".##.......",
            "....#..#..",
            "....#.....",
            "..........",
        ],
        playerStart: { col: 0, row: 0 },
        enemies: [
            { col: 6, row: 4, type: "sniper" },
            { col: 8, row: 8, type: "brute" },
        ],
        exits: [
            {
                id: "east",
                side: "se",
                at: 4,
                to: { map: "hall", exit: "back" },
                requires: [noLineOfSight],
            },
        ],
    },
    hall: {
        name: "The Hall",
        layout: [
            "........",
            "........",
            "..##....",
            "........",
            "....#...",
            "........",
            "........",
            "........",
        ],
        playerStart: { col: 0, row: 3 },
        enemies: [{ col: 5, row: 5, type: "dummy" }],
        exits: [
            {
                id: "back",
                side: "nw",
                at: 3,
                to: { map: "yard", exit: "east" },
            },
        ],
    },
}
