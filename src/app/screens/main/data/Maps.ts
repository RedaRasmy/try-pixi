import type { Battle } from "../Battle"
import type { Tile } from "../world/Board"

import type { EnemyType } from "./Enemies"

/** Screen side of the grid: nw = column -1, ne = row -1, se = column `cols`, sw = row `rows` */
export type Side = "nw" | "ne" | "se" | "sw"

/** Returns why the door is locked, or null if it can be used. `at` = the door tile. */
export type DoorCondition = (battle: Battle, at: Tile) => string | null

/** Another map (arriving at one of its exits, or at its start), or the end of the level */
export type ExitTarget = { map: string; exit?: string } | "victory"

export interface ExitDef {
    id: string
    side: Side
    /** Position along that side (a row for nw/se, a column for ne/sw) */
    at: number
    to: ExitTarget
    requires?: DoorCondition[]
}

export interface MapDef {
    name: string
    /** Shown under the turn banner */
    objective: string
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

/** Nobody would notice you standing at the door */
export const unseen: DoorCondition = (b, at) => {
    const seer = b.enemies.find((e) => !e.isDead && b.canPerceivePlayer(e, at))
    return seer ? `${seer.displayName} would notice you` : null
}

export const allEnemiesDead: DoorCondition = (b) =>
    b.enemies.every((e) => e.isDead) ? null : "Defeat every guard first"

export const needsStatus =
    (id: string, label: string): DoorCondition =>
    (b) =>
        b.player.hasStatus(id) ? null : `Needs ${label}`

// ---------- The maps ----------

export const MAPS: Record<string, MapDef> = {
    yard: {
        name: "The Yard",
        objective: "Reach the east gate. No guard may see it.",
        layout: [
            "..........",
            "..........",
            "...###....",
            "..........",
            "......#...",
            "......#...",
            "..........",
            ".##.......",
            "..........",
            "..........",
        ],
        playerStart: { col: 0, row: 0 },
        enemies: [{ col: 7, row: 3, type: "soldier" }],
        exits: [
            {
                id: "gate-1",
                side: "se",
                at: 5,
                to: { map: "corridor" },
                requires: [noLineOfSight],
            },
        ],
    },
    corridor: {
        name: "The Corridor",
        objective: "Reach the south gate while Laplace Demon is active.",
        layout: [
            "..........",
            ".####.###.",
            "..........",
            "..........",
            "##.####.##",
            "..........",
            "..........",
            ".###..###.",
            "..........",
            "..........",
        ],
        playerStart: { col: 0, row: 0 },
        enemies: [
            { col: 6, row: 6, type: "soldier" },
            { col: 7, row: 6, type: "soldier" },
        ],
        exits: [
            {
                id: "gate-2",
                side: "sw",
                at: 5,
                to: { map: "armory" },
                requires: [needsStatus("laplace", "Laplace Demon")],
            },
        ],
    },
    armory: {
        name: "The Armory",
        objective: "Defeat every guard, then leave through the north gate.",
        layout: [
            "..........",
            "..........",
            "..##..##..",
            "..........",
            "....##....",
            "....##....",
            "..........",
            "..##..##..",
            "..........",
            "..........",
        ],
        playerStart: { col: 0, row: 0 },
        enemies: [
            { col: 8, row: 4, type: "soldier" },
            { col: 8, row: 7, type: "soldier" },
        ],
        exits: [
            {
                id: "gate-3",
                side: "ne",
                at: 5,
                to: "victory",
                requires: [allEnemiesDead],
            },
        ],
    },
}
