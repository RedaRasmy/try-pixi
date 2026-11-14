import { animate } from "motion"
import { Container, Graphics, Text } from "pixi.js"

import { UiButton } from "./UiButton"

export interface ResultInfo {
    won: boolean
    title: string
    subtitle: string
    stats: { label: string; value: string }[]
    footnote?: string
}

const CARD_W = 540
const CARD_H = 350

/** End-of-level card: result, a few numbers, and what to do next */
export class GameOverPanel extends Container {
    public onReplay?: () => void
    public onMenu?: () => void

    private dim = new Graphics()
    private card = new Container()
    private cardBg = new Graphics()
    private titleText: Text
    private subtitleText: Text
    private statLayer = new Container()
    private footText: Text
    private replayButton = new UiButton("Replay", {
        width: 200,
        accent: 0x22c55e,
        filled: true,
    })
    private menuButton = new UiButton("Level select", {
        width: 200,
        accent: 0x38bdf8,
    })
    private anim?: { stop: () => void }

    constructor() {
        super()
        this.visible = false
        // Swallow clicks so the board underneath can't be used
        this.dim.eventMode = "static"

        this.titleText = new Text({
            text: "",
            style: {
                fill: 0xffffff,
                fontSize: 46,
                fontWeight: "bold",
                letterSpacing: 4,
            },
        })
        this.titleText.anchor.set(0.5)
        this.titleText.position.set(CARD_W / 2, 56)

        this.subtitleText = new Text({
            text: "",
            style: { fill: 0x94a3b8, fontSize: 16 },
        })
        this.subtitleText.anchor.set(0.5)
        this.subtitleText.position.set(CARD_W / 2, 104)

        this.statLayer.position.set(0, 138)

        this.footText = new Text({
            text: "",
            style: { fill: 0x64748b, fontSize: 13 },
        })
        this.footText.anchor.set(0.5)
        this.footText.position.set(CARD_W / 2, 232)

        this.replayButton.position.set(CARD_W / 2 - 212, CARD_H - 84)
        this.menuButton.position.set(CARD_W / 2 + 12, CARD_H - 84)
        this.replayButton.onPress = () => this.onReplay?.()
        this.menuButton.onPress = () => this.onMenu?.()

        this.card.addChild(
            this.cardBg,
            this.titleText,
            this.subtitleText,
            this.statLayer,
            this.footText,
            this.replayButton,
            this.menuButton,
        )
        this.card.pivot.set(CARD_W / 2, CARD_H / 2)
        this.addChild(this.dim, this.card)
    }

    public show(info: ResultInfo) {
        const color = info.won ? 0x22c55e : 0xef4444

        this.cardBg
            .clear()
            .roundRect(0, 0, CARD_W, CARD_H, 20)
            .fill({ color: 0x0f172a, alpha: 0.97 })
            .stroke({ width: 3, color, alpha: 0.9 })
            .rect(24, 0, CARD_W - 48, 5)
            .fill(color)

        this.titleText.text = info.title
        this.titleText.style.fill = color
        this.subtitleText.text = info.subtitle
        this.footText.text = info.footnote ?? ""
        this.replayButton.visible = true

        for (const child of this.statLayer.removeChildren())
            child.destroy({ children: true })
        const chipW = 140
        const chipGap = 16
        const total =
            info.stats.length * chipW + (info.stats.length - 1) * chipGap
        info.stats.forEach((stat, i) => {
            const chip = new Container()
            chip.position.set((CARD_W - total) / 2 + i * (chipW + chipGap), 0)

            const bg = new Graphics()
                .roundRect(0, 0, chipW, 76, 12)
                .fill(0x1e293b)
                .stroke({ width: 2, color: 0x475569 })
            const value = new Text({
                text: stat.value,
                style: { fill: 0xffffff, fontSize: 28, fontWeight: "bold" },
            })
            value.anchor.set(0.5)
            value.position.set(chipW / 2, 31)
            const caption = new Text({
                text: stat.label.toUpperCase(),
                style: {
                    fill: 0x94a3b8,
                    fontSize: 11,
                    fontWeight: "bold",
                    letterSpacing: 1,
                },
            })
            caption.anchor.set(0.5)
            caption.position.set(chipW / 2, 60)

            chip.addChild(bg, value, caption)
            this.statLayer.addChild(chip)
        })

        this.visible = true
        this.anim?.stop()
        this.card.alpha = 0
        this.card.scale.set(0.9)
        this.anim = animate(0, 1, {
            duration: 0.35,
            ease: "backOut",
            onUpdate: (t) => {
                if (this.destroyed) return
                this.card.alpha = Math.min(1, t * 2)
                this.card.scale.set(0.9 + 0.1 * t)
            },
        })
    }

    public hide() {
        this.anim?.stop()
        this.visible = false
    }

    public resize(width: number, height: number) {
        this.dim
            .clear()
            .rect(0, 0, width, height)
            .fill({ color: 0x000000, alpha: 0.72 })
        this.card.position.set(width / 2, height / 2)
    }
}
