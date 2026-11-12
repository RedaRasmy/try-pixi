import { Container, Graphics, Text } from "pixi.js"

import type { Resource } from "./Ability"
import type { Entity } from "./Entity"

const WIDTH = 250

export class StatusBar extends Container {
    public show(owner: Entity, resources: Resource[]) {
        for (const child of this.removeChildren())
            child.destroy({ children: true })

        let y = 0
        for (const r of resources) {
            const ratio = Math.max(0, Math.min(1, r.value / r.max))

            const name = new Text({
                text: r.name,
                style: { fill: 0xcbd5e1, fontSize: 13, fontWeight: "bold" },
            })
            const percent = new Text({
                text: `${Math.round(ratio * 100)}%`,
                style: { fill: r.color, fontSize: 13, fontWeight: "bold" },
            })
            percent.anchor.set(1, 0)
            percent.x = WIDTH
            name.y = percent.y = y

            const bar = new Graphics()
                .roundRect(0, y + 20, WIDTH, 8, 4)
                .fill(0x1e293b)
            if (ratio > 0)
                bar.roundRect(0, y + 20, WIDTH * ratio, 8, 4).fill(r.color)

            this.addChild(bar, name, percent)
            y += 38
        }

        let x = 0
        for (const s of owner.statuses.values()) {
            const label =
                s.turnsLeft !== undefined
                    ? `${s.name} · ${s.turnsLeft} turns`
                    : s.name
            const text = new Text({
                text: label,
                style: { fill: 0xffffff, fontSize: 13, fontWeight: "bold" },
            })
            text.position.set(x + 10, y + 5)

            const chip = new Graphics()
                .roundRect(x, y, text.width + 20, 26, 13)
                .fill({ color: s.color, alpha: 0.35 })
                .stroke({ width: 2, color: s.color })

            this.addChild(chip, text)
            x += text.width + 26
        }
    }
}
