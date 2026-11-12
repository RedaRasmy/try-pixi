import { FancyButton } from "@pixi/ui"
import { animate } from "motion"
import type { AnimationPlaybackControls } from "motion/react"
import type { Ticker } from "pixi.js"
import { Container } from "pixi.js"
import { engine } from "../../getEngine"
import { SettingsPopup } from "../../popups/SettingsPopup"
import { Board } from "./Board"
import { Player } from "./Player"

/** The screen that holds the app */
export class MainScreen extends Container {
    /** Assets bundles required by this screen */
    public static assetBundles = ["main"]
    public mainContainer: Container

    private board: Board
    private player: Player
    private settingsButton: FancyButton
    private paused = false

    constructor() {
        super()

        this.mainContainer = new Container()
        this.addChild(this.mainContainer)

        this.board = new Board(8, 8)
        this.mainContainer.addChild(this.board)

        // Player starts on tile (0, 0), added to the board so they share coordinates
        this.player = new Player(this.board, 0, 0)
        this.board.addChild(this.player)

        // Click a tile -> walk there
        this.board.onTileTap = (col, row) => this.player.walkTo(col, row)

        // Keyboard controls
        window.addEventListener("keydown", (e) => {
            if (this.paused) return
            switch (e.key) {
                case "ArrowUp":
                case "w":
                    this.player.move(0, -1)
                    break
                case "ArrowDown":
                case "s":
                    this.player.move(0, 1)
                    break
                case "ArrowLeft":
                case "a":
                    this.player.move(-1, 0)
                    break
                case "ArrowRight":
                case "d":
                    this.player.move(1, 0)
                    break
            }
        })

        const buttonAnimations = {
            hover: {
                props: {
                    scale: { x: 1.1, y: 1.1 },
                },
                duration: 100,
            },
            pressed: {
                props: {
                    scale: { x: 0.9, y: 0.9 },
                },
                duration: 100,
            },
        }

        this.settingsButton = new FancyButton({
            defaultView: "icon-settings.png",
            anchor: 0.5,
            animations: buttonAnimations,
        })
        this.settingsButton.onPress.connect(() =>
            engine().navigation.presentPopup(SettingsPopup),
        )
        this.addChild(this.settingsButton)
    }

    /** Prepare the screen just before showing */
    public prepare() {}

    /** Update the screen */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public update(_time: Ticker) {
        if (this.paused) return
    }

    /** Pause gameplay - automatically fired when a popup is presented */
    public async pause() {
        this.mainContainer.interactiveChildren = false
        this.paused = true
    }

    /** Resume gameplay */
    public async resume() {
        this.mainContainer.interactiveChildren = true
        this.paused = false
    }

    /** Fully reset */
    public reset() {}

    /** Resize the screen, fired whenever window size changes */
    public resize(width: number, height: number) {
        const centerX = width * 0.5
        const centerY = height * 0.5

        this.mainContainer.x = centerX
        this.mainContainer.y = centerY
        this.settingsButton.x = width - 30
        this.settingsButton.y = 30
    }

    /** Show screen with animations */
    public async show(): Promise<void> {
        const elementsToAnimate = [this.settingsButton]

        let finalPromise!: AnimationPlaybackControls
        for (const element of elementsToAnimate) {
            element.alpha = 0
            finalPromise = animate(
                element,
                { alpha: 1 },
                { duration: 0.3, delay: 0.75, ease: "backOut" },
            )
        }

        await finalPromise
    }

    /** Hide screen with animations */
    public async hide() {}

    /** Auto pause the app when window go out of focus */
    public blur() {}
}
