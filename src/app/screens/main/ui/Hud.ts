import { animate } from "motion"
import { Container, Graphics, Text } from "pixi.js"
import type { DestroyOptions } from "pixi.js"

import type { Battle } from "../Battle"

import { ActionBar } from "./ActionBar"
import { EndTurnButton } from "./EndTurnButton"
import { GameOverPanel } from "./GameOverPanel"
import { LogPanel } from "./LogPanel"
import { MenuButton, PauseMenu } from "./PauseMenu"
import { StatsPanel } from "./StatsPanel"
import { StatusBar } from "./StatusBar"
import { TimelineStrip } from "./TimelineStrip"

const MARGIN = 15
const LEFT_PANEL = StatsPanel.WIDTH + MARGIN * 2

export class Hud extends Container {
    private battle: Battle
    private actionBar: ActionBar
    private endTurn = new EndTurnButton()
    private menuButton = new MenuButton()
    private turnBanner = new Container()
    private turnBg = new Graphics()
    private turnLabel: Text
    private stageBanner = new Container()
    private stageBg = new Graphics()
    private stageLabel: Text
    private objective: Text
    private toast: Text
    private toastAnim?: { stop: () => void }
    private stats = new StatsPanel()
    private statusBar = new StatusBar()
    private timeline = new TimelineStrip()
    private log = new LogPanel()
    private pauseMenu = new PauseMenu()
    private result = new GameOverPanel()

    private viewW = 0
    private viewH = 0

    constructor(battle: Battle, onExit: () => void) {
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

        this.stageLabel = new Text({
            text: "",
            style: {
                fill: 0xcbd5e1,
                fontSize: 13,
                fontWeight: "bold",
                letterSpacing: 1,
            },
        })
        this.stageLabel.anchor.set(0.5, 0)
        this.stageBanner.addChild(this.stageBg, this.stageLabel)

        this.objective = new Text({
            text: "",
            style: { fill: 0x94a3b8, fontSize: 13 },
        })
        this.objective.anchor.set(0.5, 0)

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
            this.stageBanner,
            this.objective,
            this.timeline,
            this.toast,
            this.log,
            this.actionBar,
            this.endTurn,
            this.menuButton,
            this.pauseMenu,
            this.result,
        )

        battle.onChange = () => this.refresh()
        battle.onMessage = (text) => this.showToast(text)
        battle.onGameOver = (won) => this.showResult(won)

        this.menuButton.onPress = () => this.openPause()
        this.pauseMenu.onResume = () => this.pauseMenu.close()
        this.pauseMenu.onRestart = () => {
            this.pauseMenu.close()
            battle.reset()
        }
        this.pauseMenu.onExit = () => onExit()
        this.result.onReplay = () => {
            this.result.hide()
            battle.reset()
        }
        this.result.onMenu = () => onExit()

        window.addEventListener("keydown", this.onKey)
        this.refresh()
    }

    public override destroy(options?: DestroyOptions) {
        window.removeEventListener("keydown", this.onKey)
        super.destroy(options)
    }

    private openPause() {
        if (this.result.visible) return
        this.pauseMenu.open(this.battle.canLeave)
    }

    private onKey = (e: KeyboardEvent) => {
        if (!this.interactiveChildren || this.result.visible) return

        if (e.key === "Escape") {
            if (this.pauseMenu.visible) this.pauseMenu.close()
            else if (this.battle.selectedAction) this.battle.cancelSelection()
            else this.openPause()
            return
        }
        if (this.pauseMenu.visible) return

        if (e.key === "Enter") {
            void this.battle.endTurn()
            return
        }
        const n = Number(e.key)
        if (n >= 1 && n <= 9) this.actionBar.press(n)
    }

    private showResult(won: boolean) {
        const b = this.battle
        this.pauseMenu.close()
        this.result.show({
            won,
            title: won ? "LEVEL COMPLETE" : "DEFEAT",
            subtitle: won
                ? b.level.name
                : `${b.level.name}  ·  you fell in stage ${b.stageNumber}`,
            stats: [
                { label: "Turns", value: `${b.turn}` },
                { label: "Defeated", value: `${b.defeated}` },
                {
                    label: "Stage",
                    value: `${b.stageNumber}/${b.level.stages.length}`,
                },
            ],
            footnote: won
                ? "More levels are coming soon"
                : "Try walls, Zetsu and Laplace Demon",
        })
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
                if (this.destroyed) return
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
        this.endTurn.setUrgent(myTurn && b.player.stats.ap === 0)
        this.pauseMenu.setCanLeave(b.canLeave)

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

        this.stageLabel.text = `${b.level.name.toUpperCase()}  ·  STAGE ${b.stageNumber}/${b.level.stages.length}`
        this.stageLabel.y = 4
        const sw = this.stageLabel.width + 32
        this.stageBg
            .clear()
            .roundRect(-sw / 2, 0, sw, 24, 12)
            .fill({ color: 0x0f172a, alpha: 0.85 })
            .stroke({ width: 2, color: 0x334155 })
        this.objective.text = b.objective

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
        this.statusBar.position.set(MARGIN, MARGIN + StatsPanel.HEIGHT + 12)
        this.turnBanner.position.set(width / 2, MARGIN)
        this.stageBanner.position.set(width / 2, MARGIN + 44)
        this.objective.position.set(width / 2, MARGIN + 76)
        this.toast.position.set(width / 2, MARGIN + 100)
        this.timeline.position.set(LEFT_PANEL, MARGIN + 132)

        this.menuButton.position.set(width - MARGIN - 40, MARGIN)
        this.log.position.set(width - LogPanel.WIDTH - MARGIN, MARGIN + 52)

        this.endTurn.position.set(
            width - EndTurnButton.WIDTH - MARGIN,
            height - EndTurnButton.HEIGHT - MARGIN,
        )
        this.actionBar.resize(
            width,
            height,
            (EndTurnButton.WIDTH + MARGIN * 2) * 2,
        )
        this.pauseMenu.resize(width, height)
        this.result.resize(width, height)
        this.refresh()
    }
}
