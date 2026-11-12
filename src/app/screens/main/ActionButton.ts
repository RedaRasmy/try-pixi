import { Container, Graphics, Text } from "pixi.js"

export class ActionButton extends Container {
    public onPress?: () => void

    private bg = new Graphics()
    private actionLabel: Text
    private btnWidth: number
    private btnHeight: number
    private selected = false
    private enabled = true

    constructor(text: string, width = 150, height = 60) {
        super()
        this.btnWidth = width
        this.btnHeight = height

        this.actionLabel = new Text({
            text,
            style: { fill: 0xffffff, fontSize: 15, align: "center" },
        })
        this.actionLabel.anchor.set(0.5)
        this.actionLabel.position.set(width / 2, height / 2)

        this.addChild(this.bg, this.actionLabel)
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
        const fill = !this.enabled
            ? 0x3a3a3a
            : this.selected
              ? 0xdc2626
              : 0x2563eb
        this.bg
            .clear()
            .roundRect(0, 0, this.btnWidth, this.btnHeight, 12)
            .fill(fill)
            .stroke({
                width: this.selected ? 4 : 2,
                color: this.selected ? 0xfde047 : 0xffffff,
                alpha: this.selected ? 1 : 0.4,
            })
        this.alpha = this.enabled ? 1 : 0.5
    }
}
