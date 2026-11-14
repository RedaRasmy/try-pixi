import { Container, Graphics, Text } from "pixi.js"

import { combatLog } from "./CombatLog"

const SHOWN = 8

export class LogPanel extends Container {
    public static readonly WIDTH = 330

    private bg = new Graphics()
    private body = new Container()

    constructor() {
        super()
        this.addChild(this.bg, this.body)
        combatLog.onChange = () => this.redraw()
        this.redraw()
    }

    private redraw() {
        for (const child of this.body.removeChildren()) child.destroy()
        const lines = combatLog.lines.slice(-SHOWN)
        this.visible = lines.length > 0

        const title = new Text({
            text: "COMBAT LOG",
            style: {
                fill: 0x64748b,
                fontSize: 11,
                fontWeight: "bold",
                letterSpacing: 1,
            },
        })
        title.position.set(12, 8)
        this.body.addChild(title)

        let y = 28
        lines.forEach((line, i) => {
            const text = new Text({
                text: line.text,
                style: {
                    fill: line.color,
                    fontSize: 12,
                    wordWrap: true,
                    wordWrapWidth: LogPanel.WIDTH - 24,
                },
            })
            text.alpha = i === lines.length - 1 ? 1 : 0.7
            text.position.set(12, y)
            this.body.addChild(text)
            y += text.height + 4
        })

        this.bg
            .clear()
            .roundRect(0, 0, LogPanel.WIDTH, y + 6, 12)
            .fill({ color: 0x0f172a, alpha: 0.78 })
            .stroke({ width: 2, color: 0xffffff, alpha: 0.12 })
    }
}
