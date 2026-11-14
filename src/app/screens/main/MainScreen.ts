import { FancyButton } from "@pixi/ui"
import { animate } from "motion"
import type { AnimationPlaybackControls } from "motion/react"
import type { Ticker } from "pixi.js"
import { Container } from "pixi.js"
import { engine } from "../../getEngine"
import { SettingsPopup } from "../../popups/SettingsPopup"
import { LEVEL } from "./data/Level"
import { Battle } from "./Battle"
import { Board } from "./world/Board"
import { Hud } from "./ui/Hud"

/** The screen that holds the app */
export class MainScreen extends Container {
    /** Assets bundles required by this screen */
    public static assetBundles = ["main"]

    public mainContainer: Container
    private settingsButton: FancyButton
    private board: Board
    private battle: Battle
    private hud: Hud
    private paused = false

    constructor() {
        super()

        this.mainContainer = new Container()
        this.addChild(this.mainContainer)

        this.board = new Board(LEVEL)
        this.mainContainer.addChild(this.board)

        this.battle = new Battle(this.board)
        this.hud = new Hud(this.battle)
        this.addChild(this.hud)

        const buttonAnimations = {
            hover: { props: { scale: { x: 1.1, y: 1.1 } }, duration: 100 },
            pressed: { props: { scale: { x: 0.9, y: 0.9 } }, duration: 100 },
        }

        this.settingsButton = new FancyButton({
            defaultView: "icon-settings.png",
            anchor: 0.5,
            animations: buttonAnimations,
        })
        this.settingsButton.onPress.connect(() =>
            engine().navigation.presentPopup(SettingsPopup),
        )
        // this.addChild(this.settingsButton)
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
        this.hud.interactiveChildren = false
        this.paused = true
    }

    /** Resume gameplay */
    public async resume() {
        this.mainContainer.interactiveChildren = true
        this.hud.interactiveChildren = true
        this.paused = false
    }

    /** Fully reset */
    public reset() {}

    /** Resize the screen, fired whenever window size changes */
    public resize(width: number, height: number) {
        this.mainContainer.x = width * 0.5
        this.mainContainer.y = height * 0.45
        this.mainContainer.scale.set(Math.min(1, width / 1400, height / 950))

        this.settingsButton.x = width - 30
        this.settingsButton.y = 30

        this.hud.resize(width, height)
    }

    /** Show screen with animations */
    public async show(): Promise<void> {
        const elementsToAnimate = [this.settingsButton, this.hud]

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
