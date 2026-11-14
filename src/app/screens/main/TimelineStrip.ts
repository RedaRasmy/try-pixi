import { Container, Graphics, Text } from "pixi.js"

import type { Forecast } from "./Battle"

/** What the preview shows, in order. The step being replayed is highlighted. */
export class TimelineStrip extends Container {
    public show(forecast: Forecast | null, maxWidth = 900, active = -1) {
        for (const child of this.removeChildren())
            child.destroy({ children: true })
        if (!forecast) return

        let x = 0
        let y = 0
        const pill = (content: string, color: number, highlight = false) => {
            const text = new Text({
                text: content,
                style: { fill: 0xffffff, fontSize: 14, fontWeight: "bold" },
            })
            const w = text.width + 24
            if (x > 0 && x + w > maxWidth) {
                x = 0
                y += 34
            }
            text.position.set(x + 12, y + 6)
            const bg = new Graphics()
                .roundRect(x, y, w, 28, 14)
                .fill({
                    color: highlight ? color : 0x0f172a,
                    alpha: highlight ? 0.9 : 0.88,
                })
                .stroke({
                    width: highlight ? 3 : 2,
                    color: highlight ? 0xffffff : color,
                })
            this.addChild(bg, text)
            x += w + 8
        }

        pill("PREVIEW  ·  inside the zone only", 0xa78bfa)

        forecast.steps.forEach((step, i) => {
            const enemy = step.team === "enemy"
            const parts = [`${i + 1}  ${step.name}`]

            if (step.idle) {
                parts.push(step.idle)
            } else {
                parts.push(
                    step.path.length > 0
                        ? `moves ${step.path.length}`
                        : "holds",
                )
                if (step.attacks.length > 0) {
                    const total = step.attacks.reduce(
                        (sum, a) => sum + a.damage,
                        0,
                    )
                    parts.push(
                        `${step.attacks.length}x hit  -${total}${enemy ? "" : " temp"}`,
                    )
                }
                if (step.attacks.some((a) => a.kills)) parts.push("KO")
                if (step.attacks.some((a) => a.pushTo)) parts.push("push")
            }
            pill(parts.join("  ·  "), enemy ? 0xec4899 : 0x22d3ee, i === active)
        })

        for (const note of forecast.notes) pill(note, 0xa78bfa)
        if (forecast.result) {
            pill(
                forecast.result === "won" ? "Victory" : "Defeat",
                forecast.result === "won" ? 0x22c55e : 0xdc2626,
            )
        }
    }
}
