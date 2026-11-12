import type { Action } from "./Actions"
import type { Tile } from "./Board"
import type { Entity } from "./Entity"

/** A bar shown in the HUD (charge, rage...) */
export interface Resource {
    id: string
    name: string
    color: number
    value: number
    max: number
}

/** Everything Battle needs to know about a special ability */
export interface Ability {
    readonly actions: Action[]
    readonly resources: Resource[]
    /** Extra entities the ability puts on the board (clones, summons...) */
    readonly entities: Entity[]

    /** If not null, enemies attack this instead of the player */
    perceivedTarget(): Entity | null
    /** Moves this ability's entities will make at the end of the turn (for the preview) */
    plannedMoves(): Map<Entity, Tile[]>
    showsForecast(): boolean
    /** false = the player would break the ability by going there */
    isTileSafe(tile: Tile): boolean
    /** A reason the action can't be used right now, or null */
    blocksAction(action: Action): string | null

    onDamageDealt(target: Entity, amount: number): void
    /** A new player turn begins */
    onTurnStart(): void
    /** The ability's entities act (runs before the enemies) */
    playTurn(): Promise<void>
    /** Validate the ability after anything moved or got hurt */
    check(): void
    /** Back to the initial state (replay) */
    reset(): void
}
