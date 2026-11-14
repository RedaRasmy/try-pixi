import { animate } from "motion"
import { Container, Graphics, Text } from "pixi.js"
import type { DestroyOptions } from "pixi.js"
import { LogPanel } from "./LogPanel"
import { ActionBar } from "./ActionBar"
import type { Battle } from "../Battle"
import { EndTurnButton } from "./EndTurnButton"
import { GameOverPanel } from "../ui/GameOverPanel"
import { StatsPanel } from "./StatsPanel"
import { StatusBar } from "./StatusBar"
import { TimelineStrip } from "./TimelineStrip"

const MARGIN = 15
const LEFT_PANEL = 280

export class Hud extends Container {
    private battle: Battle
    private actionBar: ActionBar
    private endTurn = new EndTurnButton()
    private turnBanner = new Container()
    private turnBg = new Graphics()
    private turnLabel: Text
    private toast: Text
    private toastAnim?: { stop: () => void }
    private stats = new StatsPanel()
    private statusBar = new StatusBar()
    private timeline = new TimelineStrip()
    private gameOver = new GameOverPanel()

    private viewW = 0
    private viewH = 0

    private log = new LogPanel()

    constructor(battle: Battle) {
        super()
        this.battle = battle
        this.actionBar = new ActionBar(battle)

        this.endTurn.onPress = () => void battle.endTurn()

        this.turnLabel = new Text({
            text: "",
            style: { fill: 0xffffff, fontSize: 20, fontWeight: "bold" },
        })
        this.turnLabel.anchor.set(0.5, 0)
        this.turnBanner.addChild(this.turnBg, this.turnLabel)

        this.toast = new Text({
            text: "",
            style: {
                fill: 0xffffff,
                fontSize: 18,
                fontWeight: "bold",
                stroke: { color: 0x000000, width: 4 },
            },
        })
        this.toast.anchor.set(0.5, 0)
        this.toast.alpha = 0

        this.addChild(
            this.stats,
            this.statusBar,
            this.turnBanner,
            this.timeline,
            this.log,
            this.toast,
            this.actionBar,
            this.endTurn,
            this.gameOver,
        )

        battle.onChange = () => this.refresh()
        battle.onMessage = (text) => this.showToast(text)
        battle.onGameOver = (won) => this.gameOver.show(won)
        this.gameOver.onReplay = () => {
            this.gameOver.hide()
            battle.reset()
        }

        window.addEventListener("keydown", this.onKey)
        this.refresh()
    }

    public override destroy(options?: DestroyOptions) {
        window.removeEventListener("keydown", this.onKey)
        super.destroy(options)
    }

    private onKey = (e: KeyboardEvent) => {
        if (!this.interactiveChildren) return // paused (a popup is open)
        if (e.key === "Escape") {
            this.battle.cancelSelection()
            return
        }
        const n = Number(e.key)
        if (n >= 1 && n <= 9) this.actionBar.press(n)
    }

    private showToast(text: string) {
        this.toastAnim?.stop()
        if (!text) {
            this.toast.alpha = 0
            return
        }
        this.toast.text = text
        this.toast.alpha = 1
        this.toastAnim = animate(0, 1, {
            duration: 2.4,
            ease: "linear",
            onUpdate: (t) => {
                this.toast.alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25
            },
        })
    }

    /** Sync everything on screen with the battle state */
    private refresh() {
        const b = this.battle
        const myTurn = b.phase === "player"

        this.actionBar.refresh()
        this.endTurn.setEnabled(myTurn)

        this.turnLabel.text = `Turn ${b.turn}  -  ${b.phase === "enemy" ? "Enemy turn" : "Your turn"}`
        this.turnLabel.y = 7
        const w = this.turnLabel.width + 40
        const h = this.turnLabel.height + 14
        this.turnBg
            .clear()
            .roundRect(-w / 2, 0, w, h, h / 2)
            .fill({
                color: b.phase === "enemy" ? 0xdc2626 : 0x2563eb,
                alpha: 0.85,
            })

        const shown = b.inspected ?? b.player
        this.stats.show(shown)
        this.statusBar.show(
            shown,
            shown === b.player ? b.abilities.flatMap((a) => a.resources) : [],
        )

        this.timeline.show(
            b.forecast,
            Math.max(
                300,
                this.viewW - LEFT_PANEL - LogPanel.WIDTH - MARGIN * 2,
            ),
            b.activeStep,
        )
    }

    public resize(width: number, height: number) {
        this.viewW = width
        this.viewH = height

        this.stats.position.set(MARGIN, MARGIN)
        this.statusBar.position.set(MARGIN, MARGIN + 130 + 12)
        this.turnBanner.position.set(width / 2, MARGIN)
        this.toast.position.set(width / 2, MARGIN + 46)
        this.timeline.position.set(LEFT_PANEL, MARGIN + 84)
        this.log.position.set(width - LogPanel.WIDTH - MARGIN, MARGIN)

        this.endTurn.position.set(
            width - EndTurnButton.WIDTH - MARGIN,
            height - EndTurnButton.HEIGHT - MARGIN,
        )
        this.actionBar.resize(
            width,
            height,
            (EndTurnButton.WIDTH + MARGIN * 2) * 2,
        )
        this.gameOver.resize(width, height)

        this.refresh()
    }
}
