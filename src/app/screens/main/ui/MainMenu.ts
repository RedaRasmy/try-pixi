import { Container, Graphics, Text } from "pixi.js"

import { LEVELS } from "../data/Levels"
import type { LevelDef } from "../data/Levels"

export const GAME_TITLE = "NEN TACTICS"

const CARD_W = 480
const CARD_H = 112
const GAP = 16
const HEADER_H = 150

class LevelCard extends Container {
    public onPress?: () => void

    private bg = new Graphics()
    private hovered = false
    private locked: boolean

    constructor(def: LevelDef, index: number) {
        super()
        this.locked = !!def.comingSoon
        const accent = this.locked ? 0x64748b : 0x38bdf8

        const badge = new Graphics()
            .circle(48, CARD_H / 2, 26)
            .fill({ color: accent, alpha: 0.2 })
            .stroke({ width: 2, color: accent })
        const number = new Text({
            text: `${index + 1}`,
            style: { fill: 0xffffff, fontSize: 24, fontWeight: "bold" },
        })
        number.anchor.set(0.5)
        number.position.set(48, CARD_H / 2)

        const title = new Text({
            text: def.name,
            style: { fill: 0xffffff, fontSize: 22, fontWeight: "bold" },
        })
        title.position.set(92, 16)

        const tagline = new Text({
            text: def.tagline,
            style: {
                fill: 0x94a3b8,
                fontSize: 13,
                wordWrap: true,
                wordWrapWidth: CARD_W - 92 - 24,
            },
        })
        tagline.position.set(92, 48)

        const meta = new Text({
            text: this.locked ? "COMING SOON" : `${def.stages.length} STAGES`,
            style: {
                fill: this.locked ? 0xfbbf24 : 0x7dd3fc,
                fontSize: 11,
                fontWeight: "bold",
                letterSpacing: 1,
            },
        })
        meta.position.set(92, CARD_H - 24)

        this.addChild(this.bg, badge, number, title, tagline, meta)

        this.eventMode = "static"
        this.cursor = this.locked ? "default" : "pointer"
        this.on("pointertap", () => {
            if (!this.locked) this.onPress?.()
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

    private draw() {
        const lit = this.hovered && !this.locked
        this.bg
            .clear()
            .roundRect(0, 0, CARD_W, CARD_H, 16)
            .fill(lit ? 0x16233f : 0x111c33)
            .stroke({ width: lit ? 3 : 2, color: lit ? 0x38bdf8 : 0x334155 })
        this.alpha = this.locked ? 0.6 : 1
    }
}

export class MainMenu extends Container {
    private bg = new Graphics()
    private content = new Container()

    constructor(onStart: (level: LevelDef) => void) {
        super()

        const title = new Text({
            text: GAME_TITLE,
            style: {
                fill: 0xffffff,
                fontSize: 60,
                fontWeight: "bold",
                letterSpacing: 8,
            },
        })
        title.anchor.set(0.5, 0)
        title.position.set(CARD_W / 2, 0)

        const subtitle = new Text({
            text: "CHOOSE A LEVEL",
            style: {
                fill: 0x7dd3fc,
                fontSize: 14,
                fontWeight: "bold",
                letterSpacing: 4,
            },
        })
        subtitle.anchor.set(0.5, 0)
        subtitle.position.set(CARD_W / 2, 92)

        this.content.addChild(title, subtitle)
        LEVELS.forEach((level, i) => {
            const card = new LevelCard(level, i)
            card.position.set(0, HEADER_H + i * (CARD_H + GAP))
            card.onPress = () => onStart(level)
            this.content.addChild(card)
        })

        this.addChild(this.bg, this.content)
    }

    public resize(width: number, height: number) {
        // A faint isometric floor behind everything
        this.bg.clear().rect(0, 0, width, height).fill(0x0b1120)
        for (let j = 0; j * 32 < height + 64; j++) {
            for (let i = -1; i * 128 < width + 128; i++) {
                const x = i * 128 + (j % 2) * 64
                const y = j * 32
                this.bg
                    .poly([x, y - 32, x + 64, y, x, y + 32, x - 64, y])
                    .stroke({ width: 1, color: 0x38bdf8, alpha: 0.05 })
            }
        }

        const contentH = HEADER_H + LEVELS.length * (CARD_H + GAP) - GAP
        const scale = Math.min(
            1,
            (width - 40) / CARD_W,
            (height - 40) / contentH,
        )
        this.content.scale.set(scale)
        this.content.position.set(
            (width - CARD_W * scale) / 2,
            (height - contentH * scale) / 2,
        )
    }
}
