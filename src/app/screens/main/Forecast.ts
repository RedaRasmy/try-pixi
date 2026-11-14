import type { Battle } from "./Battle"
import type { Tile } from "./world/Board"
import { tileKey } from "./world/Board"
import { Enemy } from "./world/Enemy"
import type { Entity } from "./world/Entity"
import type { SimEvent } from "./core/Script"
import { runDry, sim } from "./core/Script"

export interface ForecastAttack {
    from: Tile
    to: Tile
    damage: number
    kills: boolean
    /** Temporary damage (a lethal hit knocks out instead of killing) */
    temp: boolean
    target: Entity
    pushTo?: Tile
    /** The push drags the real player out of an ability's zone */
    breaks?: boolean
}

export interface ForecastStep {
    actor: Entity
    name: string
    team: "ally" | "enemy"
    start: Tile
    path: Tile[]
    attacks: ForecastAttack[]
    idle?: string
}

/** Where someone stands and how healthy they are once the turn is over */
export interface Outcome {
    entity: Entity
    name: string
    from: Tile
    tile: Tile
    hpBefore: number
    hp: number
    maxHp: number
    dead: boolean
}

export interface PlaybackItem {
    ev: SimEvent
    /** Index in forecast.steps, or -1 when it isn't a timeline step */
    step: number
}

export interface Forecast {
    steps: ForecastStep[]
    notes: string[]
    outcomes: Outcome[]
    playback: PlaybackItem[]
    result?: "won" | "lost"
}

/**
 * Run the real enemy phase silently, record what happens, then put everything back.
 * Entities and abilities are restored from snapshots, so nothing leaks into the game.
 */
export function computeForecast(b: Battle, zone: Set<string>): Forecast {
    const all = b.everyone
    const before = new Map<Entity, { tile: Tile; hp: number }>(
        all.map((e) => [
            e,
            { tile: { col: e.col, row: e.row }, hp: e.stats.hp },
        ]),
    )
    const restores = [
        ...all.map((e) => e.snapshot()),
        ...b.abilities.map((a) => a.snapshot()),
    ]

    let events: SimEvent[] = []
    let outcomes: Outcome[] = []
    sim.dry = true
    sim.events = []
    try {
        runDry(b.enemyPhase())
        events = sim.events
        outcomes = all.map((e) => ({
            entity: e,
            name: e.displayName,
            from: before.get(e)!.tile,
            tile: { col: e.col, row: e.row },
            hpBefore: before.get(e)!.hp,
            hp: e.stats.hp,
            maxHp: e.stats.maxHp,
            dead: e.isDead,
        }))
    } finally {
        sim.dry = false
        sim.events = []
        for (const restore of restores.reverse()) restore()
    }
    return buildForecast(events, outcomes, zone)
}

/** Group events into one step per actor. Anything outside the zone is left out of the steps. */
function buildForecast(
    events: SimEvent[],
    outcomes: Outcome[],
    zone: Set<string>,
): Forecast {
    const inZ = (t: Tile) => zone.has(tileKey(t))
    const isSeen = (ev: SimEvent) => {
        switch (ev.kind) {
            case "move":
                return inZ(ev.from) || ev.path.some(inZ)
            case "attack":
            case "push":
                return inZ(ev.from) || inZ(ev.to)
            case "idle":
                return inZ(ev.at)
            case "heal":
                return false
            default:
                return true
        }
    }

    const steps: ForecastStep[] = []
    const notes: string[] = []
    const playback: PlaybackItem[] = []
    let lastAttack: ForecastAttack | null = null
    let killSeen = false
    let ended: boolean | undefined

    const stepFor = (actor: Entity, start: Tile) => {
        const last = steps[steps.length - 1]
        if (last && last.actor === actor) return last
        const step: ForecastStep = {
            actor,
            name: actor.displayName,
            team: actor instanceof Enemy ? "enemy" : "ally",
            start,
            path: [],
            attacks: [],
        }
        steps.push(step)
        return step
    }

    for (const ev of events) {
        let index = -1
        if (isSeen(ev)) {
            switch (ev.kind) {
                case "move": {
                    const start = inZ(ev.from) ? ev.from : ev.path.find(inZ)!
                    const step = stepFor(ev.actor, start)
                    step.path = ev.path.filter(inZ)
                    index = steps.indexOf(step)
                    break
                }
                case "attack": {
                    const step = stepFor(ev.actor, ev.from)
                    lastAttack = {
                        from: ev.from,
                        to: ev.to,
                        damage: ev.damage,
                        kills: ev.kills,
                        temp: ev.temp,
                        target: ev.target,
                    }
                    if (ev.kills && !ev.temp) killSeen = true
                    step.attacks.push(lastAttack)
                    index = steps.indexOf(step)
                    break
                }
                case "push":
                    if (lastAttack && lastAttack.target === ev.target) {
                        lastAttack.pushTo = ev.to
                        lastAttack.breaks = ev.breaks
                    }
                    break
                case "idle": {
                    const step = stepFor(ev.actor, ev.at)
                    step.idle = ev.reason
                    index = steps.indexOf(step)
                    break
                }
                case "note":
                    notes.push(ev.text)
                    break
                case "end":
                    ended = ev.won
                    break
            }
        }
        playback.push({ ev, step: index })
    }

    // A victory is only known if you saw the killing blow
    let result: Forecast["result"]
    if (ended === false) result = "lost"
    else if (ended === true && killSeen) result = "won"

    return { steps, notes, outcomes, playback, result }
}
