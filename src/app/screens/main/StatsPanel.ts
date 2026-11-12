import { Container, Graphics, Text } from "pixi.js"

import type { Entity } from "./Entity"
import { HeartMeter, StatRow } from "./Meters"

export class StatsPanel extends Container {
    private bg = new Graphics()
    private statsName = new Text({
        text: "",
        style: { fill: 0xe2e8f0, fontSize: 16, fontWeight: "bold" },
    })
    private heart = new HeartMeter(32)
    private ap = new StatRow("star", 0xa83232)
    private mp = new StatRow("move", 0x4ade80)

    constructor() {
        super()

        this.bg
            .roundRect(0, 0, 250, 130, 14)
            .fill({ color: 0x0f172a, alpha: 0.8 })
            .stroke({ width: 2, color: 0xffffff, alpha: 0.15 })

        this.statsName.position.set(14, 10)
        this.heart.position.set(48, 70)

        this.ap.position.set(100, 70)
        this.mp.position.set(170, 70)

        this.addChild(this.bg, this.statsName, this.heart, this.ap, this.mp)
    }

    public show(entity: Entity) {
        const s = entity.stats
        this.statsName.text = entity.displayName
        this.heart.set(s.hp, s.maxHp)
        this.ap.set(s.ap)
        this.mp.set(s.mp)
    }
}
