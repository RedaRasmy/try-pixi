import { Container, Graphics, Text } from "pixi.js"

import type { Entity } from "./Entity"
import { createIcon } from "./Icons"
import { HeartMeter, StatRow } from "./Meters"

export class StatsPanel extends Container {
    private bg = new Graphics()
    private statsName = new Text({
        text: "",
        style: { fill: 0xe2e8f0, fontSize: 16, fontWeight: "bold" },
    })
    private heart = new HeartMeter(32)
    private ap = new StatRow("bolt", 0xfacc15)
    private mp = new StatRow("move", 0x4ade80)
    private damageText = new Text({
        text: "",
        style: { fill: 0xfb923c, fontSize: 18, fontWeight: "bold" },
    })

    constructor() {
        super()

        this.bg
            .roundRect(0, 0, 250, 130, 14)
            .fill({ color: 0x0f172a, alpha: 0.8 })
            .stroke({ width: 2, color: 0xffffff, alpha: 0.15 })

        this.statsName.position.set(14, 10)
        this.heart.position.set(48, 80)

        this.ap.position.set(100, 60)
        this.mp.position.set(170, 60)

        const swordIcon = createIcon("sword", 0xfb923c, 0.8)
        swordIcon.position.set(113, 100)
        this.damageText.anchor.set(0, 0.5)
        this.damageText.position.set(136, 100)

        this.addChild(
            this.bg,
            this.statsName,
            this.heart,
            this.ap,
            this.mp,
            swordIcon,
            this.damageText,
        )
    }

    public show(entity: Entity) {
        const s = entity.stats
        this.statsName.text = entity.displayName
        this.heart.set(s.hp, s.maxHp)
        this.ap.set(s.ap)
        this.mp.set(s.mp)
        this.damageText.text = `+${s.damage} damage`
    }
}
