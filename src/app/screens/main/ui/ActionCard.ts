import { Container, Graphics, Text } from "pixi.js"
import type { Action } from "../core/Actions"
import { groupColor, isSelfAction } from "../core/Actions"
import { createIcon } from "./Icons"

export const CARD_W = 96
export const CARD_H = 92

export class ActionCard extends Container {
    public onPress?: () => void
    public onHover?: (over: boolean) => void

    private bg = new Graphics()
    private hotkeyText: Text
    private accent: number
    private selected = false
    private enabled = true
    private hovered = false

    constructor(public readonly action: Action) {
        super()
        this.accent = groupColor(action.group)
        const cx = CARD_W / 2

        // Round badge: the icon, or the first letter until you have art
        const badge = new Graphics()
            .circle(cx, 38, 17)
            .fill({ color: this.accent, alpha: 0.22 })
            .stroke({ width: 2, color: this.accent, alpha: 0.9 })
        this.addChild(this.bg, badge)

        if (action.icon) {
            const icon = createIcon(action.icon, 0xffffff, 0.8)
            icon.position.set(cx, 38)
            this.addChild(icon)
        } else {
            const letter = new Text({
                text: action.name.charAt(0).toUpperCase(),
                style: { fill: 0xffffff, fontSize: 18, fontWeight: "bold" },
            })
            letter.anchor.set(0.5)
            letter.position.set(cx, 38)
            this.addChild(letter)
        }

        const title = new Text({
            text: action.name,
            style: { fill: 0xffffff, fontSize: 12, fontWeight: "bold" },
        })
        title.anchor.set(0.5)
        title.position.set(cx, 66)

        const subtitle =
            action.subtitle ??
            (isSelfAction(action)
                ? "self"
                : `range ${
                      action.minRange === action.maxRange
                          ? action.maxRange
                          : `${action.minRange}-${action.maxRange}`
                  }`)
        const sub = new Text({
            text: subtitle,
            style: {
                fill: 0x94a3b8,
                fontSize: 9,
                align: "center",
                wordWrap: true,
                wordWrapWidth: CARD_W - 10,
            },
        })
        sub.anchor.set(0.5, 0)
        sub.position.set(cx, 76)
        this.addChild(title, sub)

        // AP cost (top-left)
        if (action.apCost > 0) {
            const costBg = new Graphics()
                .roundRect(5, 5, 38, 18, 9)
                .fill(0x0f172a)
                .stroke({ width: 2, color: 0xa83232 })
            const costIcon = createIcon("star", 0xa83232, 0.4)
            costIcon.position.set(15, 14)
            const cost = new Text({
                text: `${action.apCost}`,
                style: { fill: 0xfacc15, fontSize: 12, fontWeight: "bold" },
            })
            cost.anchor.set(0, 0.5)
            cost.position.set(25, 14)
            this.addChild(costBg, costIcon, cost)
        }

        // Hotkey (top-right)
        this.hotkeyText = new Text({
            text: "",
            style: { fill: 0x64748b, fontSize: 11, fontWeight: "bold" },
        })
        this.hotkeyText.anchor.set(1, 0)
        this.hotkeyText.position.set(CARD_W - 7, 7)
        this.addChild(this.hotkeyText)

        this.eventMode = "static"
        this.cursor = "pointer"
        this.on("pointertap", () => this.onPress?.())
        this.on("pointerover", () => {
            this.hovered = true
            this.draw()
            this.onHover?.(true)
        })
        this.on("pointerout", () => {
            this.hovered = false
            this.draw()
            this.onHover?.(false)
        })
        this.draw()
    }

    public setHotkey(key: string) {
        this.hotkeyText.text = key
    }

    public setSelected(value: boolean) {
        this.selected = value
        this.draw()
    }

    public setEnabled(value: boolean) {
        this.enabled = value
        this.cursor = value ? "pointer" : "default"
        this.draw()
    }

    private draw() {
        const border = this.selected
            ? 0xfde047
            : this.hovered && this.enabled
              ? this.accent
              : 0x475569
        this.bg
            .clear()
            .roundRect(0, 0, CARD_W, CARD_H, 12)
            .fill(this.selected ? 0x7f1d1d : 0x1e293b)
            .stroke({ width: this.selected ? 3 : 2, color: border })
            .rect(14, 0, CARD_W - 28, 3)
            .fill(this.accent)
        this.alpha = this.enabled ? 1 : 0.45
    }
}
