import { Container, Graphics, Text } from "pixi.js"
import { animate } from "motion"
import type { IconKind } from "./Icons"
import { createIcon } from "./Icons"

function heartPath(g: Graphics, s: number) {
    return g
        .moveTo(0, s * 0.9)
        .bezierCurveTo(-s * 1.4, 0, -s * 0.7, -s * 1.3, 0, -s * 0.35)
        .bezierCurveTo(s * 0.7, -s * 1.3, s * 1.4, 0, 0, s * 0.9)
        .closePath()
}

/** A heart that drains as HP goes down, with the HP number inside */
export class HeartMeter extends Container {
    private size: number
    private fillMask = new Graphics()
    private hpText: Text

    constructor(size = 32) {
        super()
        this.size = size

        const back = heartPath(new Graphics(), size)
            .fill(0x3f1d1d)
            .stroke({ width: 3, color: 0x000000, alpha: 0.6 })

        const fill = heartPath(new Graphics(), size).fill(0xef4444)
        fill.mask = this.fillMask

        this.hpText = new Text({
            text: "",
            style: {
                fill: 0xffffff,
                fontSize: Math.round(size * 0.6),
                fontWeight: "bold",
                stroke: { color: 0x000000, width: 4 },
            },
        })
        this.hpText.anchor.set(0.5)
        this.hpText.y = size * 0.05

        this.addChild(back, this.fillMask, fill, this.hpText)
    }

    public set(hp: number, maxHp: number) {
        const ratio = Math.max(0, Math.min(1, hp / maxHp))
        const s = this.size
        const span = s * 1.7
        this.fillMask
            .clear()
            .rect(-s * 1.5, s * 0.95 - ratio * span, s * 3, ratio * span)
            .fill(0xffffff)
        this.hpText.text = `${hp}`
    }
}

/** An icon followed by a single number */
export class StatRow extends Container {
    private valueText: Text

    constructor(kind: IconKind, color: number) {
        super()
        const icon = createIcon(kind, color, 0.9)
        icon.x = 13

        this.valueText = new Text({
            text: "",
            style: { fill: color, fontSize: 24, fontWeight: "bold" },
        })
        this.valueText.anchor.set(0, 0.5)
        this.valueText.x = 36

        this.addChild(icon, this.valueText)
    }

    public set(value: number) {
        this.valueText.text = `${value}`
    }
}

/** A rounded bar. When the value drops, a pale "ghost" slowly drains behind it. */
export class BarMeter extends Container {
    private fillBar = new Graphics()
    private ghostBar = new Graphics()
    private ratio = 1
    private ghostRatio = 1
    private anim?: { stop: () => void }

    constructor(
        private barW: number,
        private barH: number,
        private pickColor: (ratio: number) => number,
    ) {
        super()
        const back = new Graphics()
            .roundRect(0, 0, barW, barH, barH / 2)
            .fill(0x0b1220)
            .stroke({ width: 2, color: 0x000000, alpha: 0.5 })
        this.addChild(back, this.ghostBar, this.fillBar)
        this.draw()
    }

    /** `snap` = jump without animating (used when a different entity is shown) */
    public set(value: number, snap = false) {
        const next = Math.max(0, Math.min(1, value))
        const dropped = next < this.ratio
        this.ratio = next
        this.anim?.stop()

        if (snap || !dropped) {
            this.ghostRatio = next
            this.draw()
            return
        }

        const from = Math.max(this.ghostRatio, next)
        this.draw()
        this.anim = animate(0, 1, {
            duration: 0.5,
            delay: 0.35,
            ease: "easeOut",
            onUpdate: (t) => {
                if (this.destroyed) return
                this.ghostRatio = from + (next - from) * t
                this.draw()
            },
        })
    }

    private draw() {
        const w = this.barW
        const h = this.barH
        this.ghostBar.clear()
        if (this.ghostRatio > 0) {
            this.ghostBar
                .roundRect(0, 0, Math.max(h, w * this.ghostRatio), h, h / 2)
                .fill({ color: 0xffffff, alpha: 0.55 })
        }
        this.fillBar.clear()
        if (this.ratio > 0) {
            const fw = Math.max(h, w * this.ratio)
            this.fillBar
                .roundRect(0, 0, fw, h, h / 2)
                .fill(this.pickColor(this.ratio))
                .roundRect(3, 2, Math.max(0, fw - 6), h / 3, h / 6)
                .fill({ color: 0xffffff, alpha: 0.25 })
        }
    }
}
