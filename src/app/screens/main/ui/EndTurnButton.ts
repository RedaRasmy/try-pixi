import { Container, Graphics, Text } from "pixi.js"

export class EndTurnButton extends Container {
    public static readonly WIDTH = 160
    public static readonly HEIGHT = 56

    public onPress?: () => void

    private bg = new Graphics()
    private enabled = true

    constructor() {
        super()
        const { HEIGHT: h } = EndTurnButton

        const label = new Text({
            text: "END TURN",
            style: {
                fill: 0xffffff,
                fontSize: 17,
                fontWeight: "bold",
                letterSpacing: 1,
            },
        })
        label.anchor.set(0, 0.5)
        label.position.set(32, h / 2)

        this.addChild(this.bg, label)
        this.eventMode = "static"
        this.cursor = "pointer"
        this.on("pointertap", () => {
            if (this.enabled) this.onPress?.()
        })
        this.draw()
    }

    public setEnabled(value: boolean) {
        this.enabled = value
        this.cursor = value ? "pointer" : "default"
        this.draw()
    }

    private draw() {
        const { WIDTH: w, HEIGHT: h } = EndTurnButton
        this.bg
            .clear()
            .roundRect(0, 0, w, h, h / 2)
            .fill(this.enabled ? 0x16a34a : 0x3a3a3a)
            .stroke({
                width: 3,
                color: 0xffffff,
                alpha: this.enabled ? 0.6 : 0.2,
            })
        this.alpha = this.enabled ? 1 : 0.5
    }
}
