import type { Action } from "../core/Actions"
import type { Tile } from "../world/Board"
import type { Entity } from "../world/Entity"
import type { TurnPlan } from "../core/Planner"
import type { Script } from "../core/Script"

/** A bar shown in the HUD (charge, mana, rage...) */
export interface Resource {
    id: string
    name: string
    color: number
    value: number
    max: number
    /** Show "4/6" instead of a percentage */
    count?: boolean
}

export interface Ability {
    readonly actions: Action[]
    readonly resources: Resource[]
    /** Extra entities the ability puts on the board (clones, summons...) */
    readonly entities: Entity[]

    /** What this enemy believes it is fighting, or null for the real player */
    perceivedTarget(viewer: Entity): Entity | null
    /** What the ability's own entities will do this turn (used by the preview) */
    plannedTurns(): { entity: Entity; plan: TurnPlan }[]
    showsForecast(): boolean
    /** Tiles the player can see. null = everything (no fog) */
    visibleTiles(): Tile[] | null
    /** A reason the player can't walk right now, or null */
    blocksMovement(): string | null
    /** false = the player would break the ability by going there */
    isTileSafe(tile: Tile): boolean
    /** A reason the action can't be used right now, or null */
    blocksAction(action: Action): string | null

    onDamageDealt(target: Entity, amount: number): void
    /** The player pressed End Turn */
    onTurnEnd(): void
    /** A new player turn begins */
    onTurnStart(): void
    /** The ability's entities act (runs before the enemies) */
    playTurn(): Script
    /** Validate the ability after anything moved or got hurt */
    check(): void
    reset(): void
    /** A reason this target can't be attacked right now, or null */
    blocksTarget(target: Entity): string | null
    /** The player just used one of the actions (any ability). Resources, activation... */
    afterAction(action: Action): void
    /** Hovering yourself with a self action selected: tiles it would reveal (zones...) */
    selfCastPreview(action: Action): { tiles: Tile[]; label: string } | null
    /** Sync what is drawn (clone visibility...) with the current state */
    refreshView(): void
    /** Save the ability's state. Call the returned function to restore it (used by the preview). */
    snapshot(): () => void
    /** Tiles the player can foresee while previewing, or null if there is no limit */
    previewTiles(): Tile[] | null
    /** The player is leaving this map. Position-based effects should end. */
    onMapChange(): void
}

/** Do-nothing defaults. Override only what your ability needs. */
export abstract class BaseAbility implements Ability {
    public actions: Action[] = []
    public resources: Resource[] = []
    public get entities(): Entity[] {
        return []
    }
    public blocksTarget(_target: Entity): string | null {
        return null
    }
    public afterAction(_action: Action) {}
    public selfCastPreview(
        _action: Action,
    ): { tiles: Tile[]; label: string } | null {
        return null
    }
    public refreshView() {}

    public perceivedTarget(_viewer: Entity): Entity | null {
        return null
    }
    public plannedTurns(): { entity: Entity; plan: TurnPlan }[] {
        return []
    }
    public showsForecast() {
        return false
    }
    public visibleTiles(): Tile[] | null {
        return null
    }
    public blocksMovement(): string | null {
        return null
    }
    public isTileSafe(_tile: Tile) {
        return true
    }
    public blocksAction(_action: Action): string | null {
        return null
    }
    public onDamageDealt(_target: Entity, _amount: number) {}
    public onTurnEnd() {}
    public onTurnStart() {}
    public *playTurn(): Script {}
    public snapshot() {
        return () => {}
    }
    public check() {}
    public reset() {}

    public previewTiles(): Tile[] | null {
        return null
    }
    public onMapChange() {}
}
