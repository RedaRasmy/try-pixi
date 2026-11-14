import type { Action } from "../core/Actions"
import type { Entity } from "../world/Entity"
import { sim } from "../core/Script"

export interface LogLine {
    text: string
    color: number
}

class CombatLog {
    public lines: LogLine[] = []
    public onChange?: () => void

    /** Simulations (the preview) never write to the real log */
    public add(text: string, color = 0xe2e8f0) {
        if (sim.dry) return
        this.lines.push({ text, color })
        if (this.lines.length > 60) this.lines.shift()
        this.onChange?.()
    }

    public clear() {
        this.lines = []
        this.onChange?.()
    }
}

export const combatLog = new CombatLog()

const lighten = (c: number) => {
    const mix = (v: number) => Math.round(v + (255 - v) * 0.45)
    return (
        (mix((c >> 16) & 255) << 16) | (mix((c >> 8) & 255) << 8) | mix(c & 255)
    )
}

/** Call right after the damage was applied */
export function logHit(
    attacker: Entity,
    target: Entity,
    action: Action,
    dealt: number,
    temp = false,
) {
    const hp = `${target.stats.hp}/${target.stats.maxHp} HP`
    const tail = temp ? "  (temporary)" : ""
    combatLog.add(
        `${attacker.displayName} hit ${target.displayName} with ${action.name}: -${dealt}  [${hp}]${tail}`,
        lighten(attacker.color),
    )
    if (target.unconscious) {
        combatLog.add(
            `${target.displayName} is knocked out until Laplace ends`,
            0xfbbf24,
        )
    } else if (target.isDead) {
        combatLog.add(`${target.displayName} is defeated`, 0xf87171)
    }
}
