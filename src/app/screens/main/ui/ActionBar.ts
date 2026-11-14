import { Container, Graphics, Text } from "pixi.js"
import { ActionCard, CARD_H, CARD_W } from "./ActionCard"
import type { Action } from "../core/Actions"
import { describeAction, groupColor, isSelfAction } from "../core/Actions"
import type { Battle } from "../Battle"

const GAP = 6
const TAB_H = 26
const MARGIN = 15
/** More visible cards than this and the bar splits into tabs by group */
const TAB_THRESHOLD = 16
const EYES_ACTIONS = new Set(["close-eyes", "open-eyes"])

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
    /** Visible actions in reading order (hotkey order) */
    private shown: Action[] = []
    private current = ""
    private tabbed = false
    private hovered: Action | null = null

    private viewW = 0
    private viewH = 0
    private reserved = 0
    private contentW = 0
    private contentH = 0
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
        this.addChild(this.tabLayer, this.cardLayer, this.tip)
    }

    /** Hotkey: 1 = first visible card */
    public press(n: number) {
        const action = this.shown[n - 1]
        if (action) this.battle.selectAction(action)
    }

    public refresh() {
        const b = this.battle
        const myTurn = b.phase === "player"
        const groupOf = (a: Action) => a.group ?? "Combat"

        const visible = [...this.cards.keys()].filter((a) => b.isVisible(a))
        this.tabbed = visible.length > TAB_THRESHOLD

        // Tabs only exist when there are too many cards for two rows
        const groups = this.tabs.filter((t) =>
            visible.some((a) => groupOf(a) === t.group),
        )
        if (!groups.some((t) => t.group === this.current))
            this.current = groups[0]?.group ?? ""

        let tx = 0
        for (const tab of this.tabs) {
            const open = this.tabbed && groups.includes(tab)
            tab.box.visible = open
            if (!open) continue

            const active = tab.group === this.current
            const color = groupColor(tab.group)
            tab.bg
                .clear()
                .roundRect(0, 0, tab.width, TAB_H, 13)
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

        // Cards: row by row, two rows
        const shown = this.tabbed
            ? visible.filter((a) => groupOf(a) === this.current)
            : visible
        const mainRow = shown.filter(
            (a) => groupOf(a) !== "Nen" && !EYES_ACTIONS.has(a.id),
        )
        const eyes = shown.filter((a) => EYES_ACTIONS.has(a.id))
        const nenRow = shown.filter((a) => groupOf(a) === "Nen")
        const topRow = [...mainRow, ...eyes]
        this.shown = [...topRow, ...nenRow]
        this.cardLayer.y = this.tabbed ? TAB_H + 6 : 0

        const positions = new Map<Action, { x: number; y: number }>()
        topRow.forEach((action, i) =>
            positions.set(action, { x: i * (CARD_W + GAP), y: 0 }),
        )
        const secondRowY = topRow.length > 0 ? CARD_H + GAP : 0
        nenRow.forEach((action, i) =>
            positions.set(action, {
                x: i * (CARD_W + GAP),
                y: secondRowY,
            }),
        )

        for (const [action, card] of this.cards) {
            const i = this.shown.indexOf(action)
            card.visible = i >= 0
            if (i < 0) continue

            const position = positions.get(action)!
            card.position.set(position.x, position.y)
            card.setHotkey(i < 9 ? `${i + 1}` : "")
            card.setSelected(b.selectedAction === action || !!action.isOn?.())
            card.setEnabled(myTurn && !b.unusableReason(action))
        }
        const columns = Math.max(topRow.length, nenRow.length)
        const rows = Number(topRow.length > 0) + Number(nenRow.length > 0)
        this.contentW = Math.max(0, columns * (CARD_W + GAP) - GAP)
        this.contentH = rows * CARD_H + Math.max(0, rows - 1) * GAP

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
        const h = (this.tabbed ? TAB_H + 6 : 0) + this.contentH
        const scale = Math.max(
            0.5,
            Math.min(1, (this.viewW - this.reserved) / w),
        )
        this.scale.set(scale)
        this.x = (this.viewW - w * scale) / 2
        this.y = this.viewH - h * scale - MARGIN
    }

    private makeTab(group: string): Tab {
        const caption = new Text({
            text: group,
            style: { fill: 0xffffff, fontSize: 12, fontWeight: "bold" },
        })
        caption.position.set(13, 5)

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
        return { group, box, bg, caption, width: caption.width + 26 }
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

        const nodes: Text[] = [
            new Text({
                text: `${action.name}   ${action.apCost} AP`,
                style: { fill: 0xffffff, fontSize: 15, fontWeight: "bold" },
            }),
            new Text({
                text: describeAction(action),
                style: {
                    fill: 0xcbd5e1,
                    fontSize: 13,
                    wordWrap: true,
                    wordWrapWidth: 260,
                },
            }),
        ]
        if (isSelfAction(action)) {
            nodes.push(
                new Text({
                    text: "Select it, then click yourself",
                    style: { fill: 0x86efac, fontSize: 12 },
                }),
            )
        }
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
        const cardX = this.cardLayer.x + card.x
        this.tip.x = Math.min(
            cardX,
            Math.max(0, Math.max(this.contentW, this.tabsW) - w),
        )
        this.tip.y = -h - 6
    }
}
