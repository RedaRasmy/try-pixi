import { animate } from "motion"
import type { AnimationPlaybackControls } from "motion/react"
import { Container, Graphics, Text } from "pixi.js"

import type { Action } from "./Actions"
import { ActionCard } from "./ActionCard"
import type { Battle } from "./Battle"
import { EndTurnButton } from "./EndTurnButton"
import { GameOverPanel } from "./GameOverPanel"
import { StatsPanel } from "./StatsPanel"
import { StatusBar } from "./StatusBar"

const MARGIN = 15
const CARD_STEP = 124
const CARD_GAP = 12
const CARD_H = 108

export class Hud extends Container {
    private battle: Battle
    private bar = new Container()
    private cards = new Map<Action, ActionCard>()
    private endTurn = new EndTurnButton()
    private turnBanner = new Container()
    private turnBg = new Graphics()
    private turnLabel: Text
    private toast: Text
    private toastAnim?: AnimationPlaybackControls
    private stats = new StatsPanel()
    private statusBar = new StatusBar()
    private gameOver = new GameOverPanel()

    private viewW = 0
    private viewH = 0
    private barW = 0

    constructor(battle: Battle) {
        super()
        this.battle = battle

        for (const action of battle.allActions) {
            const card = new ActionCard(action)
            card.onPress = () => battle.selectAction(action)
            this.bar.addChild(card)
            this.cards.set(action, card)
        }

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
            this.toast,
            this.bar,
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

        this.refresh()
    }

    private showToast(text: string) {
        this.toastAnim?.stop()
        this.toast.text = text
        this.toast.alpha = 1
        this.toastAnim = animate(
            this.toast,
            { alpha: 0 },
            { duration: 0.6, delay: 1.8 },
        )
    }

    /** Sync everything on screen with the battle state */
    private refresh() {
        const b = this.battle
        const myTurn = b.phase === "player"

        for (const [action, card] of this.cards) {
            card.visible = b.isVisible(action)
            const on = action.kind === "instant" && !!action.isOn?.()
            card.setSelected(b.selectedAction === action || on)
            card.setEnabled(myTurn && !b.unusableReason(action))
        }
        this.layoutBar()
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

        this.stats.show(b.inspected ?? b.player)
        this.statusBar.show(
            b.player,
            b.abilities.flatMap((a) => a.resources),
        )
    }

    /** Lay out only the visible cards and center them */
    private layoutBar() {
        let x = 0
        for (const card of this.cards.values()) {
            if (!card.visible) continue
            card.x = x
            x += CARD_STEP
        }
        this.barW = Math.max(0, x - CARD_GAP)

        if (this.viewW === 0) return
        // Keep the action bar clear of the End Turn button
        const reserved = (EndTurnButton.WIDTH + MARGIN * 2) * 2
        const scale = Math.max(
            0.4,
            Math.min(1, (this.viewW - reserved) / Math.max(1, this.barW)),
        )
        this.bar.scale.set(scale)
        this.bar.x = (this.viewW - this.barW * scale) / 2
        this.bar.y = this.viewH - CARD_H * scale - MARGIN
    }

    public resize(width: number, height: number) {
        this.viewW = width
        this.viewH = height

        this.stats.position.set(MARGIN, MARGIN)
        this.statusBar.position.set(MARGIN, MARGIN + 130 + 12)
        this.turnBanner.position.set(width / 2, MARGIN)
        this.toast.position.set(width / 2, MARGIN + 46)

        this.endTurn.position.set(
            width - EndTurnButton.WIDTH - MARGIN,
            height - EndTurnButton.HEIGHT - MARGIN,
        )

        this.layoutBar()
        this.gameOver.resize(width, height)
    }
}
