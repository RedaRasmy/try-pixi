import { Container, Graphics, Text } from "pixi.js"

import type { Action } from "./Actions"
import { createIcon } from "./Icons"

const W = 112
const H = 108

export class ActionCard extends Container {
    public onPress?: () => void

    private bg = new Graphics()
    private selected = false
    private enabled = true

    constructor(action: Action) {
        super()

        const range =
            action.minRange === action.maxRange
                ? `${action.maxRange}`
                : `${action.minRange}-${action.maxRange}`

        // Icon in a dark circle
        const iconBg = new Graphics()
            .circle(W / 2, 46, 25)
            .fill({ color: 0x000000, alpha: 0.35 })
        const icon = createIcon(action.icon, 0xffffff, 1.1)
        icon.position.set(W / 2, 46)

        // AP cost pill (top-left)
        const costBg = new Graphics()
            .roundRect(6, 6, 44, 22, 11)
            .fill(0x0f172a)
            .stroke({ width: 2, color: 0xfacc15 })
        const costIcon = createIcon("bolt", 0xfacc15, 0.5)
        costIcon.position.set(19, 17)
        const cost = new Text({
            text: `${action.apCost}`,
            style: { fill: 0xfacc15, fontSize: 15, fontWeight: "bold" },
        })
        cost.anchor.set(0, 0.5)
        cost.position.set(31, 17)

        const name = new Text({
            text: action.name,
            style: { fill: 0xffffff, fontSize: 15, fontWeight: "bold" },
        })
        name.anchor.set(0.5)
        name.position.set(W / 2, 82)

        const rangeText = new Text({
            text: `range ${range}`,
            style: { fill: 0x94a3b8, fontSize: 11 },
        })
        rangeText.anchor.set(0.5)
        rangeText.position.set(W / 2, 98)

        this.addChild(
            this.bg,
            iconBg,
            icon,
            costBg,
            costIcon,
            cost,
            name,
            rangeText,
        )

        this.eventMode = "static"
        this.cursor = "pointer"
        this.on("pointertap", () => {
            if (this.enabled) this.onPress?.()
        })
        this.draw()
    }

    public setSelected(value: boolean) {
        this.selected = value
        this.draw()
    }

    public setEnabled(value: boolean) {
        this.enabled = value
        this.cursor = value ? "pointer" : "default"
        this.draw()
    }

    private draw() {
        this.bg
            .clear()
            .roundRect(0, 0, W, H, 14)
            .fill(this.selected ? 0x7f1d1d : 0x1e293b)
            .stroke({
                width: this.selected ? 4 : 2,
                color: this.selected ? 0xfde047 : 0x475569,
            })
        this.alpha = this.enabled ? 1 : 0.45
    }
}
