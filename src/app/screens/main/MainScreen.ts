import { animate } from "motion"
import type { Ticker } from "pixi.js"
import { Container } from "pixi.js"

import type { LevelDef } from "./data/Levels"
import { Game } from "./Game"
import { MainMenu } from "./ui/MainMenu"

/** The screen that holds the app: a menu, and the running level */
export class MainScreen extends Container {
    /** Assets bundles required by this screen */
    public static assetBundles = ["main"]

    private menu: MainMenu
    private game: Game | null = null
    private viewW = 0
    private viewH = 0
    private paused = false

    constructor() {
        super()
        this.menu = new MainMenu((level) => this.startLevel(level))
        this.addChild(this.menu)
    }

    private startLevel(level: LevelDef) {
        this.game?.destroy({ children: true })
        // Leaving is deferred: the button that asked for it is still handling its click
        const game = new Game(level, () =>
            setTimeout(() => this.closeLevel(), 0),
        )
        this.game = game
        this.addChildAt(game, 0)
        this.menu.visible = false
        game.setPaused(this.paused)
        game.resize(this.viewW, this.viewH)
    }

    private closeLevel() {
        this.game?.destroy({ children: true })
        this.game = null
        this.menu.visible = true
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
        this.paused = true
        this.game?.setPaused(true)
    }

    /** Resume gameplay */
    public async resume() {
        this.paused = false
        this.game?.setPaused(false)
    }

    /** Fully reset */
    public reset() {}

    /** Resize the screen, fired whenever window size changes */
    public resize(width: number, height: number) {
        this.viewW = width
        this.viewH = height
        this.menu.resize(width, height)
        this.game?.resize(width, height)
    }

    /** Show screen with animations */
    public async show(): Promise<void> {
        this.alpha = 0
        await animate(this, { alpha: 1 }, { duration: 0.3 })
    }

    /** Hide screen with animations */
    public async hide() {}

    /** Auto pause the app when window go out of focus */
    public blur() {}
}
