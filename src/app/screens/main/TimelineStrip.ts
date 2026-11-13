import { Container, Graphics, Text } from "pixi.js"

import type { ForecastStep } from "./Battle"

/** One pill per actor, in the order they will act */
export class TimelineStrip extends Container {
    public show(steps: ForecastStep[]) {
        for (const child of this.removeChildren())
            child.destroy({ children: true })

        let x = 0
        steps.forEach((step, i) => {
            const enemy = step.team === "enemy"
            const color = enemy ? 0xec4899 : 0x22d3ee
            const total = step.attacks.reduce((sum, a) => sum + a.damage, 0)

            const parts = [`${i + 1}  ${step.name}`]
            parts.push(
                step.path.length > 0 ? `moves ${step.path.length}` : "holds",
            )
            if (step.attacks.length > 0) {
                parts.push(
                    `${step.attacks.length}x hit  -${total}${enemy ? "" : " temp"}`,
                )
            }
            if (step.attacks.some((a) => a.kills)) parts.push("KO")
            if (step.attacks.some((a) => a.pushTo)) parts.push("push")

            const text = new Text({
                text: parts.join("  ·  "),
                style: { fill: 0xffffff, fontSize: 14, fontWeight: "bold" },
            })
            text.position.set(x + 12, 6)

            const pill = new Graphics()
                .roundRect(x, 0, text.width + 24, 28, 14)
                .fill({ color: 0x0f172a, alpha: 0.85 })
                .stroke({ width: 2, color })

            this.addChild(pill, text)
            x += text.width + 24 + 8
        })
    }
}
