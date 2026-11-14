import { Container, Graphics, Text } from "pixi.js"

import { UiButton } from "./UiButton"

/** Top-right button with three bars */
export class MenuButton extends Container {
    public onPress?: () => void

    private bg = new Graphics()
    private hovered = false

    constructor() {
        super()
        this.addChild(this.bg)
        this.eventMode = "static"
        this.cursor = "pointer"
        this.on("pointertap", () => this.onPress?.())
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
        this.bg
            .clear()
            .roundRect(0, 0, 40, 40, 10)
            .fill({ color: 0x1e293b, alpha: 0.92 })
            .stroke({ width: 2, color: this.hovered ? 0x94a3b8 : 0x475569 })
        for (const y of [13, 20, 27]) {
            this.bg
                .moveTo(11, y)
                .lineTo(29, y)
                .stroke({ width: 3, color: 0xe2e8f0, cap: "round" })
        }
    }
}

const PANEL_W = 340
const PANEL_H = 330

export class PauseMenu extends Container {
    public onResume?: () => void
    public onRestart?: () => void
    public onExit?: () => void

    private dim = new Graphics()
    private panel = new Container()
    private resumeButton = new UiButton("Resume", {
        width: 260,
        accent: 0x22c55e,
        filled: true,
    })
    private restartButton = new UiButton("Restart level", {
        width: 260,
        accent: 0xf59e0b,
    })
    private exitButton = new UiButton("Exit to menu", {
        width: 260,
        accent: 0xef4444,
    })
    private note: Text

    constructor() {
        super()
        this.visible = false
        // Swallow clicks so the board underneath can't be used
        this.dim.eventMode = "static"

        const bg = new Graphics()
            .roundRect(0, 0, PANEL_W, PANEL_H, 18)
            .fill({ color: 0x0f172a, alpha: 0.97 })
            .stroke({ width: 2, color: 0xffffff, alpha: 0.18 })
        const title = new Text({
            text: "PAUSED",
            style: {
                fill: 0xffffff,
                fontSize: 28,
                fontWeight: "bold",
                letterSpacing: 4,
            },
        })
        title.anchor.set(0.5)
        title.position.set(PANEL_W / 2, 44)

        this.resumeButton.position.set(40, 94)
        this.restartButton.position.set(40, 162)
        this.exitButton.position.set(40, 230)
        this.resumeButton.onPress = () => this.onResume?.()
        this.restartButton.onPress = () => this.onRestart?.()
        this.exitButton.onPress = () => this.onExit?.()

        this.note = new Text({
            text: "Finish the current turn to restart or leave",
            style: { fill: 0x94a3b8, fontSize: 12 },
        })
        this.note.anchor.set(0.5)
        this.note.position.set(PANEL_W / 2, 302)

        this.panel.addChild(
            bg,
            title,
            this.resumeButton,
            this.restartButton,
            this.exitButton,
            this.note,
        )
        this.panel.pivot.set(PANEL_W / 2, PANEL_H / 2)
        this.addChild(this.dim, this.panel)
    }

    public open(canLeave: boolean) {
        this.visible = true
        this.setCanLeave(canLeave)
    }

    public close() {
        this.visible = false
    }

    /** Restarting or leaving mid-animation would corrupt the turn */
    public setCanLeave(canLeave: boolean) {
        this.restartButton.setEnabled(canLeave)
        this.exitButton.setEnabled(canLeave)
        this.note.visible = !canLeave
    }

    public resize(width: number, height: number) {
        this.dim
            .clear()
            .rect(0, 0, width, height)
            .fill({ color: 0x000000, alpha: 0.65 })
        this.panel.position.set(width / 2, height / 2)
        this.panel.scale.set(
            Math.min(1, (width - 20) / PANEL_W, (height - 20) / PANEL_H),
        )
    }
}
