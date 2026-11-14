import { Container, Graphics, Text } from "pixi.js"
import type { Entity } from "../world/Entity"
import { createIcon } from "./Icons"
import { BarMeter, HeartMeter } from "./Meters"

const W = 270
const H = 126

const hpColor = (ratio: number) =>
    ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfacc15 : 0xef4444

const caption = (text: string, x: number, y: number) => {
    const t = new Text({
        text,
        style: {
            fill: 0x64748b,
            fontSize: 10,
            fontWeight: "bold",
            letterSpacing: 1,
        },
    })
    t.position.set(x, y)
    return t
}

export class StatsPanel extends Container {
    public static readonly WIDTH = W
    public static readonly HEIGHT = H

    private dot = new Graphics()
    private titleText = new Text({
        text: "",
        style: { fill: 0xe2e8f0, fontSize: 15, fontWeight: "bold" },
    })
    private ammoText = new Text({
        text: "",
        style: { fill: 0xfbbf24, fontSize: 12, fontWeight: "bold" },
    })
    private heart = new HeartMeter(20)
    private hpBar = new BarMeter(188, 14, hpColor)
    private apText = new Text({
        text: "",
        style: { fill: 0xfacc15, fontSize: 16, fontWeight: "bold" },
    })
    private apBar = new BarMeter(188, 12, () => 0xfacc15)
    private shown: Entity | null = null

    constructor() {
        super()

        const bg = new Graphics()
            .roundRect(0, 0, W, H, 14)
            .fill({ color: 0x0f172a, alpha: 0.85 })
            .stroke({ width: 2, color: 0xffffff, alpha: 0.12 })
            .rect(18, 0, W - 36, 3)
            .fill(0x475569)

        this.titleText.position.set(32, 10)
        this.ammoText.anchor.set(1, 0)
        this.ammoText.position.set(W - 14, 12)

        // Health: heart with the number inside, bar next to it
        this.heart.position.set(34, 60)
        this.hpBar.position.set(70, 52)

        // Action points: number in a badge, bar next to it
        const apBadge = new Graphics()
            .circle(34, 98, 16)
            .fill(0x1e293b)
            .stroke({ width: 2, color: 0xa83232 })
        this.apText.anchor.set(0.5)
        this.apText.position.set(34, 98)
        this.apBar.position.set(70, 92)

        const apLabel = caption("ACTION POINTS", 70, 76)
        const star = createIcon("star", 0xa83232, 0.4)
        star.position.set(apLabel.x + apLabel.width + 12, apLabel.y + 6)

        this.addChild(
            bg,
            this.dot,
            this.titleText,
            this.ammoText,
            caption("HEALTH", 70, 38),
            this.hpBar,
            this.heart,
            apLabel,
            star,
            apBadge,
            this.apText,
            this.apBar,
        )
    }

    public show(entity: Entity) {
        const s = entity.stats
        const snap = entity !== this.shown
        this.shown = entity

        this.dot.clear().circle(18, 19, 6).fill(entity.color)
        this.titleText.text = entity.displayName
        this.ammoText.text = s.maxAmmo > 0 ? `Ammo ${s.ammo}/${s.maxAmmo}` : ""

        this.heart.set(s.hp, s.maxHp)
        this.hpBar.set(s.maxHp > 0 ? s.hp / s.maxHp : 0, snap)

        this.apText.text = `${s.ap}`
        this.apText.style.fill = s.ap > 0 ? 0xfacc15 : 0x64748b
        this.apBar.set(s.maxAp > 0 ? s.ap / s.maxAp : 0, snap)
    }
}
