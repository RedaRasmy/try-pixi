import { Container, Graphics, Text } from "pixi.js"

import { ActionButton } from "./ActionButton"

export class GameOverPanel extends Container {
    public onReplay?: () => void

    private dim = new Graphics()
    private title: Text
    private replayButton: ActionButton

    constructor() {
        super()
        this.visible = false

        // Swallow clicks so the board underneath can't be used
        this.dim.eventMode = "static"

        this.title = new Text({
            text: "",
            style: { fill: 0xffffff, fontSize: 56, fontWeight: "bold" },
        })
        this.title.anchor.set(0.5)

        this.replayButton = new ActionButton("Replay", 200, 64)
        this.replayButton.onPress = () => this.onReplay?.()

        this.addChild(this.dim, this.title, this.replayButton)
    }

    public show(won: boolean) {
        this.title.text = won ? "Victory!" : "Defeat"
        this.visible = true
    }

    public hide() {
        this.visible = false
    }

    public resize(width: number, height: number) {
        this.dim
            .clear()
            .rect(0, 0, width, height)
            .fill({ color: 0x000000, alpha: 0.7 })
        this.title.position.set(width / 2, height / 2 - 50)
        this.replayButton.position.set(width / 2 - 100, height / 2 + 20)
    }
}
