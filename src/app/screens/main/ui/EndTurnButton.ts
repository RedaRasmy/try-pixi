import { Container, Graphics, Text } from "pixi.js"

import { CARD_H } from "./ActionCard"

const ACCENT = 0xf59e0b

export class EndTurnButton extends Container {
    public static readonly WIDTH = 112
    public static readonly HEIGHT = CARD_H

    public onPress?: () => void

    private bg = new Graphics()
    private enabled = true
    private urgent = false
    private hovered = false

    constructor() {
        super()
        const cx = EndTurnButton.WIDTH / 2

        const badge = new Graphics()
            .circle(cx, 38, 17)
            .fill({ color: ACCENT, alpha: 0.22 })
            .stroke({ width: 2, color: ACCENT, alpha: 0.9 })
        const chevrons = new Graphics()
        for (const dx of [-5, 4]) {
            chevrons
                .moveTo(cx + dx - 4, 31)
                .lineTo(cx + dx + 3, 38)
                .lineTo(cx + dx - 4, 45)
                .stroke({
                    width: 3,
                    color: 0xffffff,
                    cap: "round",
                    join: "round",
                })
        }

        const title = new Text({
            text: "End Turn",
            style: { fill: 0xffffff, fontSize: 12, fontWeight: "bold" },
        })
        title.anchor.set(0.5)
        title.position.set(cx, 66)

        const hint = new Text({
            text: "Enter",
            style: { fill: 0x64748b, fontSize: 9, fontWeight: "bold" },
        })
        hint.anchor.set(0.5)
        hint.position.set(cx, 80)

        this.addChild(this.bg, badge, chevrons, title, hint)
        this.eventMode = "static"
        this.cursor = "pointer"
        this.on("pointertap", () => {
            if (this.enabled) this.onPress?.()
        })
        this.on("pointerover", () => {
            this.hovered = true
            this.draw()
        })
        this.on("pointerout", () => {
            this.hovered = false
            this.draw()
        })
        this.draw()
    }

    public setEnabled(value: boolean) {
        this.enabled = value
        this.cursor = value ? "pointer" : "default"
        this.draw()
    }

    /** Nothing left to do this turn: draw attention */
    public setUrgent(value: boolean) {
        this.urgent = value
        this.draw()
    }

    private draw() {
        const { WIDTH: w, HEIGHT: h } = EndTurnButton
        const lit = this.enabled && (this.urgent || this.hovered)
        this.bg
            .clear()
            .roundRect(0, 0, w, h, 12)
            .fill(this.urgent && this.enabled ? 0x3a2a0a : 0x1e293b)
            .stroke({
                width: this.urgent && this.enabled ? 3 : 2,
                color: lit ? ACCENT : 0x475569,
            })
            .rect(14, 0, w - 28, 3)
            .fill(ACCENT)
        this.alpha = this.enabled ? 1 : 0.45
    }
}
