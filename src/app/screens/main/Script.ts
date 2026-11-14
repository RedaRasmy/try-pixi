import type { Tile } from "./Board"
import type { Entity } from "./Entity"

/** A turn written as a script. Each `yield` is something to wait for (an animation or a pause). */
export type Script<T = void> = Generator<
    Promise<unknown> | undefined,
    T,
    undefined
>

export type SimEvent =
    | { kind: "move"; actor: Entity; from: Tile; path: Tile[] }
    | {
          kind: "attack"
          actor: Entity
          target: Entity
          from: Tile
          to: Tile
          damage: number
          kills: boolean
      }
    | {
          kind: "push"
          target: Entity
          from: Tile
          to: Tile
          path: Tile[]
          breaks: boolean
      }
    | { kind: "heal"; target: Entity; amount: number }
    | { kind: "idle"; actor: Entity; at: Tile; reason: string }
    | { kind: "note"; text: string }
    | { kind: "end"; won: boolean }

/** dry = a silent simulation: no animations, no visuals, events are recorded */
export const sim = { dry: false, events: [] as SimEvent[] }

export function record(event: SimEvent) {
    if (sim.dry) sim.events.push(event)
}

export const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

export function* pause(ms: number): Script {
    if (!sim.dry) yield wait(ms)
}

/** Play a script for real: wait for every yielded promise */
export async function runLive<T>(script: Script<T>): Promise<T> {
    let step = script.next()
    while (!step.done) {
        if (step.value) await step.value
        step = script.next()
    }
    return step.value as T
}

/** Run a script instantly (promises are ignored, state changes are synchronous) */
export function runDry<T>(script: Script<T>): T {
    let step = script.next()
    while (!step.done) step = script.next()
    return step.value as T
}
