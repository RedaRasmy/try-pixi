import { EYES, EYES_SENSE, ZETSU } from "./abilities/Nen"
import type { Battle } from "./Battle"
import { manhattan } from "./world/Board"
import type { Tile } from "./world/Board"
import type { Entity } from "./world/Entity"

/** Who sees whom: the player's view of enemies, and the enemies' view of the player */
export class Perception {
    constructor(private b: Battle) {}

    /** Can the player see (or feel) this entity right now? */
    public playerPerceives(e: Entity) {
        const p = this.b.player
        const d = manhattan(p, e)
        const sense = p.senseRadius

        if (p.hasStatus(EYES)) {
            // En feels everything, Zetsu users included. Plain closed eyes don't feel Zetsu.
            if (sense > 0 && d <= sense) return true
            return !e.hasStatus(ZETSU) && d <= EYES_SENSE
        }
        if (!e.hasStatus(ZETSU)) return true
        return d <= sense || this.b.board.hasLineOfSight(p, e)
    }

    /** Who this enemy believes it is fighting, or null if it can't find anyone */
    public targetFor(enemy: Entity): Entity | null {
        for (const a of this.b.abilities) {
            const target = a.perceivedTarget(enemy)
            if (target) return target
        }
        return this.canPerceivePlayer(enemy) ? this.b.player : null
    }

    /**
     * Enemies see you only with a clear line of sight. Enemies with En feel you
     * through walls (Zetsu doesn't help against that). `at` = where you would stand.
     */
    public canPerceivePlayer(enemy: Entity, at: Tile = this.b.player) {
        if (enemy.senseRadius > 0 && manhattan(enemy, at) <= enemy.senseRadius)
            return true
        return this.b.board.hasLineOfSight(enemy, at)
    }

    /** Union of what every ability lets the player see. null = no darkness. */
    public fogTiles(): Tile[] | null {
        let visible: Tile[] | null = null
        for (const a of this.b.abilities) {
            const tiles = a.visibleTiles()
            if (tiles) visible = [...(visible ?? []), ...tiles]
        }
        return visible
    }

    /** Hide what the player can't perceive and mark what they only feel */
    public syncView() {
        for (const a of this.b.abilities) a.refreshView()

        const fog = this.fogTiles()
        const sensed: { tile: Tile; color: number }[] = []
        for (const e of this.b.enemies) {
            const seen = !e.isDead && this.playerPerceives(e)
            e.visible = seen
            const inDark =
                fog && !fog.some((t) => t.col === e.col && t.row === e.row)
            if (seen && inDark) sensed.push({ tile: e, color: 0xef4444 })
        }
        this.b.board.setSensed(sensed)
        this.b.board.setFog(fog)
    }
}
