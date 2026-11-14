import { Text } from "pixi.js"

import type { Board, Tile } from "./Board"
import { tileKey } from "./Board"
import type { Forecast } from "./Battle"
import { Entity } from "./Entity"
import { wait } from "./Script"

export interface PreviewOptions {
    /** Tile keys the player can see. Everything else stays hidden. */
    zone: Set<string>
    isEnemy: (e: Entity) => boolean
    /** Called with the index of the timeline step being played (-1 = none) */
    onStep?: (index: number) => void
}

const ENEMY_HIT = 0xef4444
const ALLY_HIT = 0xd97706

/**
 * Replays a recorded forecast on puppets (throwaway copies of the entities).
 * The real entities are hidden meanwhile and never touched.
 */
export class Preview {
    private run = 0
    private puppets = new Map<Entity, Entity>()
    private hidden: { entity: Entity; visible: boolean }[] = []

    constructor(private board: Board) {}

    public play(forecast: Forecast, options: PreviewOptions) {
        this.stop()
        for (const o of forecast.outcomes) {
            this.hidden.push({ entity: o.entity, visible: o.entity.visible })
            o.entity.visible = false
        }
        void this.loop(this.run, forecast, options)
    }

    /** Stop playing and bring the real entities back */
    public stop() {
        this.run++
        this.clearPuppets()
        for (const h of this.hidden) {
            if (!h.entity.destroyed) h.entity.visible = h.visible
        }
        this.hidden = []
    }

    private async loop(id: number, f: Forecast, o: PreviewOptions) {
        while (id === this.run) {
            this.spawn(f, o.zone)
            o.onStep?.(-1)
            await wait(700)

            for (const item of f.playback) {
                if (id !== this.run) return
                await this.playEvent(item.ev, item.step, id, o)
            }
            if (id !== this.run) return

            o.onStep?.(-1)
            await wait(1800)
            this.clearPuppets()
        }
    }

    private spawn(f: Forecast, zone: Set<string>) {
        for (const o of f.outcomes) {
            const e = o.entity
            const puppet = new Entity(this.board, {
                name: e.displayName,
                col: o.from.col,
                row: o.from.row,
                color: e.color,
                stats: { ...e.stats },
            })
            puppet.alpha = e.alpha
            puppet.visible = zone.has(tileKey(o.from)) && !puppet.isDead

            const tag = new Text({
                text: e.displayName,
                style: {
                    fill: 0xffffff,
                    fontSize: 13,
                    fontWeight: "bold",
                    stroke: { color: 0x000000, width: 3 },
                },
            })
            tag.anchor.set(0.5)
            tag.y = -104
            puppet.addChild(tag)

            this.board.entityLayer.addChild(puppet)
            this.puppets.set(e, puppet)
        }
    }

    private clearPuppets() {
        for (const p of this.puppets.values()) {
            p.visible = false
            p.parent?.removeChild(p)
            // Destroyed late so animations still in flight can finish safely
            setTimeout(() => {
                if (!p.destroyed) p.destroy({ children: true })
            }, 900)
        }
        this.puppets.clear()
    }

    private async playEvent(
        ev: Forecast["playback"][number]["ev"],
        step: number,
        id: number,
        o: PreviewOptions,
    ) {
        const inZone = (t: Tile) => o.zone.has(tileKey(t))

        switch (ev.kind) {
            case "move":
            case "push": {
                const puppet = this.puppets.get(
                    ev.kind === "move" ? ev.actor : ev.target,
                )
                if (!puppet) return
                o.onStep?.(step)
                await this.walk(puppet, ev.path, id, o.zone)
                await wait(150)
                return
            }
            case "attack": {
                const attacker = this.puppets.get(ev.actor)
                const target = this.puppets.get(ev.target)
                if (!attacker || !target) return
                o.onStep?.(step)

                const seen = inZone(ev.from) || inZone(ev.to)
                if (seen) {
                    this.board.flashAttack(
                        ev.from,
                        ev.to,
                        o.isEnemy(ev.actor) ? ENEMY_HIT : ALLY_HIT,
                    )
                    await wait(320)
                    if (id !== this.run) return
                }

                if (target.visible) {
                    await target.takeDamage(ev.damage)
                    if (!o.isEnemy(ev.actor)) {
                        target.showFloatingText("temporary", 0xfbbf24, 22, 30)
                    }
                } else {
                    // Out of sight: the number changes, nothing is shown
                    target.stats.hp = Math.max(0, target.stats.hp - ev.damage)
                    target.drawHp()
                }
                await wait(300)
                return
            }
            case "idle": {
                const puppet = this.puppets.get(ev.actor)
                if (!puppet) return
                o.onStep?.(step)
                if (puppet.visible)
                    puppet.showFloatingText(ev.reason, 0x94a3b8, 20)
                await wait(450)
                return
            }
            case "heal": {
                const puppet = this.puppets.get(ev.target)
                if (!puppet) return
                if (puppet.visible) {
                    puppet.heal(ev.amount)
                    await wait(500)
                } else {
                    puppet.stats.hp = Math.min(
                        puppet.stats.maxHp,
                        puppet.stats.hp + ev.amount,
                    )
                    puppet.drawHp()
                }
                return
            }
            default:
                return
        }
    }

    /** Walk tile by tile. Steps entirely outside the zone are skipped instantly. */
    private async walk(
        puppet: Entity,
        path: Tile[],
        id: number,
        zone: Set<string>,
    ) {
        for (const tile of path) {
            if (id !== this.run) return
            const here = zone.has(tileKey({ col: puppet.col, row: puppet.row }))
            const there = zone.has(tileKey(tile))

            if (here || there) {
                puppet.visible = !puppet.isDead
                await puppet.slide([tile])
            } else {
                puppet.place(tile)
            }
            puppet.visible = there && !puppet.isDead
        }
    }
}
