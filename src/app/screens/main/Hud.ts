import { Container, Graphics, Text } from "pixi.js"

import type { Action } from "./Actions"
import { ActionCard } from "./ActionCard"
import type { Battle } from "./Battle"
import { EndTurnButton } from "./EndTurnButton"
import { GameOverPanel } from "./GameOverPanel"
import { StatsPanel } from "./StatsPanel"

const MARGIN = 15

export class Hud extends Container {
    private battle: Battle
    private bar = new Container()
    private cards = new Map<Action, ActionCard>()
    private endTurn = new EndTurnButton()
    private turnBanner = new Container()
    private turnBg = new Graphics()
    private turnLabel: Text
    private stats = new StatsPanel()
    private gameOver = new GameOverPanel()

    constructor(battle: Battle) {
        super()
        this.battle = battle

        // Action cards, centered at the bottom
        let x = 0
        for (const action of battle.player.actions) {
            const card = new ActionCard(action)
            card.x = x
            card.onPress = () => battle.selectAction(action)
            this.bar.addChild(card)
            this.cards.set(action, card)
            x += 124
        }

        // End turn lives on its own, bottom-right
        this.endTurn.onPress = () => void battle.endTurn()

        // Turn banner, top-center
        this.turnLabel = new Text({
            text: "",
            style: { fill: 0xffffff, fontSize: 20, fontWeight: "bold" },
        })
        this.turnLabel.anchor.set(0.5, 0)
        this.turnBanner.addChild(this.turnBg, this.turnLabel)

        this.addChild(
            this.stats,
            this.turnBanner,
            this.bar,
            this.endTurn,
            this.gameOver,
        )

        battle.onChange = () => this.refresh()
        battle.onGameOver = (won) => this.gameOver.show(won)
        this.gameOver.onReplay = () => {
            this.gameOver.hide()
            battle.reset()
        }

        this.refresh()
    }

    /** Sync everything on screen with the battle state */
    private refresh() {
        const b = this.battle
        const myTurn = b.phase === "player"

        for (const [action, card] of this.cards) {
            card.setSelected(b.selectedAction === action)
            card.setEnabled(myTurn && b.player.stats.ap >= action.apCost)
        }
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
    }

    public resize(width: number, height: number) {
        this.stats.position.set(MARGIN, MARGIN)
        this.turnBanner.position.set(width / 2, MARGIN)

        this.endTurn.position.set(
            width - EndTurnButton.WIDTH - MARGIN,
            height - EndTurnButton.HEIGHT - MARGIN,
        )

        // Keep the action bar clear of the End Turn button (reserve space on both sides)
        const reserved = (EndTurnButton.WIDTH + MARGIN * 2) * 2
        this.bar.scale.set(1)
        const barW = this.bar.width
        const barH = this.bar.height
        const scale = Math.max(0.4, Math.min(1, (width - reserved) / barW))
        this.bar.scale.set(scale)
        this.bar.x = (width - barW * scale) / 2
        this.bar.y = height - barH * scale - MARGIN

        this.gameOver.resize(width, height)
    }
}
