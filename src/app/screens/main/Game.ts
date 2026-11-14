import { Container } from "pixi.js"
import type { DestroyOptions } from "pixi.js"

import { Battle } from "./Battle"
import type { LevelDef } from "./data/Levels"
import { Hud } from "./ui/Hud"
import { Board } from "./world/Board"

export class Game extends Container {
    private world = new Container()
    private board = new Board()
    private battle: Battle
    private hud: Hud

    constructor(level: LevelDef, onExit: () => void) {
        super()
        this.world.addChild(this.board)
        this.addChild(this.world)

        this.battle = new Battle(this.board, level)
        this.hud = new Hud(this.battle, onExit)
        this.addChild(this.hud)
    }

    public resize(width: number, height: number) {
        this.world.x = width * 0.5
        this.world.y = height * 0.45
        this.world.scale.set(Math.min(1, width / 1400, height / 950))
        this.hud.resize(width, height)
    }

    /** A template popup is open: stop reacting to the mouse */
    public setPaused(paused: boolean) {
        this.world.interactiveChildren = !paused
        this.hud.interactiveChildren = !paused
    }

    public override destroy(options?: DestroyOptions) {
        this.battle.dispose()
        super.destroy(options)
    }
}
