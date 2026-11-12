import { Graphics } from "pixi.js"

export type IconKind =
    "bolt" | "move" | "sword" | "fist" | "jab" | "kick" | "arrow" | "rock"

/** Icons are drawn on a 32x32 grid centered on (0, 0) */
export function createIcon(kind: IconKind, color = 0xffffff, scale = 1) {
    const g = new Graphics()

    switch (kind) {
        case "bolt": // Action Points
            g.poly([3, -14, -8, 3, -1, 3, -4, 14, 8, -4, 1, -4]).fill(color)
            break
        case "move": // Movement Points (double chevron)
            g.poly([-13, -10, -6, -10, 2, 0, -6, 10, -13, 10, -5, 0]).fill(
                color,
            )
            g.poly([-2, -10, 5, -10, 13, 0, 5, 10, -2, 10, 6, 0]).fill(color)
            break
        case "arrow": // End turn
            g.poly([-12, -4, 2, -4, 2, -11, 13, 0, 2, 11, 2, 4, -12, 4]).fill(
                color,
            )
            break
        case "sword": // Damage
            g.poly([0, -15, 4, -9, 4, 3, -4, 3, -4, -9]).fill(color)
            g.roundRect(-9, 3, 18, 4, 2).fill(color)
            g.roundRect(-2, 7, 4, 6, 1).fill(color)
            break
        case "fist":
            drawFist(g, 0, color)
            break
        case "jab":
            drawFist(g, 4, color)
            for (const y of [-6, 0, 6]) {
                g.moveTo(-15, y)
                    .lineTo(-8, y)
                    .stroke({ width: 2, color, cap: "round" })
            }
            break
        case "kick":
            g.poly([-8, -14, 2, -14, 2, 2, 14, 8, 14, 14, -8, 14]).fill(color)
            break
        case "rock":
            g.poly([
                -12, 2, -8, -8, 0, -13, 9, -9, 13, 0, 9, 10, -2, 13, -10, 9,
            ]).fill(color)
            // A few darker cracks so it reads as a rock
            g.moveTo(-3, -7)
                .lineTo(1, -1)
                .lineTo(-2, 5)
                .stroke({ width: 2, color: 0x000000, alpha: 0.35 })
            g.moveTo(1, -1)
                .lineTo(8, 2)
                .stroke({ width: 2, color: 0x000000, alpha: 0.35 })
            break
    }

    g.scale.set(scale)
    return g
}

function drawFist(g: Graphics, ox: number, color: number) {
    g.roundRect(ox - 10, -2, 20, 16, 5).fill(color)
    for (const x of [-7.5, -2.5, 2.5, 7.5])
        g.circle(ox + x, -3, 3.6).fill(color)
    g.ellipse(ox - 10, 6, 3, 5).fill(color)
}
