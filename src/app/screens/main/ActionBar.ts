import { Container, Graphics, Text } from "pixi.js"

import { ActionCard, CARD_H, CARD_W } from "./ActionCard"
import type { Action } from "./Actions"
import { describeAction, groupColor } from "./Actions"
import type { Battle } from "./Battle"

const GAP = 8
const TAB_H = 28
const MARGIN = 15

interface Tab {
    group: string
    box: Container
    bg: Graphics
    caption: Text
    width: number
}

export class ActionBar extends Container {
    private battle: Battle
    private cards = new Map<Action, ActionCard>()
    private tabs: Tab[] = []
    private tabLayer = new Container()
    private cardLayer = new Container()
    private tip = new Container()
    /** Actions of the open tab, in hotkey order */
    private shown: Action[] = []
    private current = ""
    private hovered: Action | null = null

    private viewW = 0
    private viewH = 0
    private reserved = 0
    private contentW = 0
    private tabsW = 0

    constructor(battle: Battle) {
        super()
        this.battle = battle

        for (const action of battle.allActions) {
            const group = action.group ?? "Combat"
            if (!this.tabs.some((t) => t.group === group))
                this.tabs.push(this.makeTab(group))

            const card = new ActionCard(action)
            card.onPress = () => battle.selectAction(action)
            card.onHover = (over) => {
                if (over) this.hovered = action
                else if (this.hovered === action) this.hovered = null
                this.updateTip()
            }
            this.cardLayer.addChild(card)
            this.cards.set(action, card)
        }

        this.current = this.tabs[0]?.group ?? ""
        this.cardLayer.y = TAB_H + 8
        this.addChild(this.tabLayer, this.cardLayer, this.tip)
    }

    /** Hotkey: 1 = first card of the open tab */
    public press(n: number) {
        const action = this.shown[n - 1]
        if (action) this.battle.selectAction(action)
    }

    public refresh() {
        const b = this.battle
        const myTurn = b.phase === "player"
        const groupOf = (a: Action) => a.group ?? "Combat"

        // Tabs that currently have something to show
        const open = this.tabs.filter((t) =>
            [...this.cards.keys()].some(
                (a) => groupOf(a) === t.group && b.isVisible(a),
            ),
        )
        if (!open.some((t) => t.group === this.current))
            this.current = open[0]?.group ?? ""

        let tx = 0
        for (const tab of this.tabs) {
            const isOpen = open.includes(tab)
            tab.box.visible = isOpen
            if (!isOpen) continue

            const active = tab.group === this.current
            const color = groupColor(tab.group)
            tab.bg
                .clear()
                .roundRect(0, 0, tab.width, TAB_H, 14)
                .fill({
                    color: active ? color : 0x0f172a,
                    alpha: active ? 0.9 : 0.85,
                })
                .stroke({ width: 2, color, alpha: active ? 1 : 0.5 })
            tab.caption.style.fill = active ? 0xffffff : 0x94a3b8
            tab.box.x = tx
            tx += tab.width + 6
        }
        this.tabsW = Math.max(0, tx - 6)

        // Cards of the open tab
        this.shown = []
        let x = 0
        for (const [action, card] of this.cards) {
            const show = groupOf(action) === this.current && b.isVisible(action)
            card.visible = show
            if (!show) continue

            card.x = x
            x += CARD_W + GAP
            this.shown.push(action)
            card.setHotkey(this.shown.length <= 9 ? `${this.shown.length}` : "")

            const on = action.kind === "instant" && !!action.isOn?.()
            card.setSelected(b.selectedAction === action || on)
            card.setEnabled(myTurn && !b.unusableReason(action))
        }
        this.contentW = Math.max(0, x - GAP)

        this.place()
        this.updateTip()
    }

    /** `reserved` = horizontal space to keep free (End Turn button) */
    public resize(width: number, height: number, reserved: number) {
        this.viewW = width
        this.viewH = height
        this.reserved = reserved
        this.place()
    }

    private place() {
        if (this.viewW === 0) return
        const w = Math.max(1, this.contentW, this.tabsW)
        const scale = Math.max(
            0.4,
            Math.min(1, (this.viewW - this.reserved) / w),
        )
        this.scale.set(scale)
        this.x = (this.viewW - w * scale) / 2
        this.y = this.viewH - (TAB_H + 8 + CARD_H) * scale - MARGIN
    }

    private makeTab(group: string): Tab {
        const caption = new Text({
            text: group,
            style: { fill: 0xffffff, fontSize: 13, fontWeight: "bold" },
        })
        caption.position.set(14, 6)

        const bg = new Graphics()
        const box = new Container()
        box.addChild(bg, caption)
        box.eventMode = "static"
        box.cursor = "pointer"
        box.on("pointertap", () => {
            this.current = group
            this.refresh()
        })
        this.tabLayer.addChild(box)
        return { group, box, bg, caption, width: caption.width + 28 }
    }

    private updateTip() {
        for (const child of this.tip.removeChildren())
            child.destroy({ children: true })

        const action = this.hovered
        const card = action ? this.cards.get(action) : undefined
        if (!action || !card || !card.visible) {
            this.hovered = null
            return
        }

        const b = this.battle
        const reason = b.phase === "player" ? b.unusableReason(action) : null

        const title = new Text({
            text: `${action.name}   ${action.apCost} AP`,
            style: { fill: 0xffffff, fontSize: 15, fontWeight: "bold" },
        })
        const body = new Text({
            text: describeAction(action),
            style: {
                fill: 0xcbd5e1,
                fontSize: 13,
                wordWrap: true,
                wordWrapWidth: 260,
            },
        })
        const nodes: Text[] = [title, body]
        if (reason) {
            nodes.push(
                new Text({
                    text: reason,
                    style: { fill: 0xfca5a5, fontSize: 13 },
                }),
            )
        }

        let y = 10
        for (const node of nodes) {
            node.position.set(12, y)
            y += node.height + 5
        }
        const w = Math.max(...nodes.map((n) => n.width)) + 24
        const h = y + 5

        const bg = new Graphics()
            .roundRect(0, 0, w, h, 10)
            .fill({ color: 0x0f172a, alpha: 0.96 })
            .stroke({ width: 2, color: groupColor(action.group) })

        this.tip.addChild(bg, ...nodes)
        this.tip.x = Math.min(
            card.x,
            Math.max(0, Math.max(this.contentW, this.tabsW) - w),
        )
        this.tip.y = -h - 6
    }
}
