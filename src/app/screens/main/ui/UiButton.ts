import { Container, Graphics, Text } from "pixi.js"

export interface UiButtonOptions {
    width?: number
    height?: number
    accent?: number
    /** Solid accent colour (a main action) instead of a dark button with an accent border */
    filled?: boolean
    fontSize?: number
}

export class UiButton extends Container {
    public onPress?: () => void

    private bg = new Graphics()
    private caption: Text
    private btnW: number
    private btnH: number
    private accent: number
    private filled: boolean
    private enabled = true
    private hovered = false

    constructor(text: string, options: UiButtonOptions = {}) {
        super()
        this.btnW = options.width ?? 220
        this.btnH = options.height ?? 52
        this.accent = options.accent ?? 0x3b82f6
        this.filled = options.filled ?? false

        this.caption = new Text({
            text,
            style: {
                fill: 0xffffff,
                fontSize: options.fontSize ?? 18,
                fontWeight: "bold",
            },
        })
        this.caption.anchor.set(0.5)
        this.caption.position.set(this.btnW / 2, this.btnH / 2)

        this.addChild(this.bg, this.caption)
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

    private draw() {
        const lit = this.enabled && this.hovered
        this.bg.clear().roundRect(0, 0, this.btnW, this.btnH, 12)
        if (this.filled) {
            this.bg
                .fill({ color: this.accent, alpha: lit ? 1 : 0.88 })
                .stroke({ width: 2, color: 0xffffff, alpha: lit ? 0.7 : 0.3 })
        } else {
            this.bg
                .fill(0x1e293b)
                .stroke({
                    width: lit ? 3 : 2,
                    color: lit ? this.accent : 0x475569,
                })
                .rect(14, 0, this.btnW - 28, 3)
                .fill(this.accent)
        }
        this.alpha = this.enabled ? 1 : 0.4
    }
}
