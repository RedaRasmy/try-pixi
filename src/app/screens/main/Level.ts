import type { EnemyType } from "./Enemies"

/** '.' = floor, '#' = wall. One string per row, one character per column. */
export const LEVEL = [
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
]

export const PLAYER_START = { col: 0, row: 0 }
export const ENEMY_STARTS: { col: number; row: number; type: EnemyType }[] = [
    { col: 9, row: 4, type: "sniper" },
    { col: 8, row: 9, type: "brute" },
]
