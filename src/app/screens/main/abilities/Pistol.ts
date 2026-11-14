import { BaseAbility } from "./Ability"
import type { Resource } from "./Ability"
import type { Action } from "../core/Actions"

const MAGAZINE = 6
const SHOOT_COST = 3
const RELOAD_COST = 5

export class Pistol extends BaseAbility {
    public readonly bullets: Resource = {
        id: "bullets",
        name: "Pistol bullets",
        color: 0xfbbf24,
        value: MAGAZINE,
        max: MAGAZINE,
        count: true,
    }
    public override resources = [this.bullets]

    constructor() {
        super()
        this.actions = [
            {
                id: "pistol",
                name: "Pistol",
                group: "Combat",
                apCost: SHOOT_COST,
                minRange: 2,
                maxRange: 8,
                baseDamage: 14,
                unavailable: () =>
                    this.bullets.value <= 0
                        ? "Out of bullets, reload first"
                        : null,
            },
            {
                id: "reload",
                name: "Reload",
                group: "Combat",
                subtitle: `${MAGAZINE} bullets`,
                description: `Refill the magazine to ${MAGAZINE} bullets. Select it, then click yourself.`,
                apCost: RELOAD_COST,
                minRange: 0,
                maxRange: 0,
                unavailable: () =>
                    this.bullets.value >= MAGAZINE
                        ? "Already fully loaded"
                        : null,
                run: () => {
                    this.bullets.value = MAGAZINE
                },
            },
        ] satisfies Action[]
    }

    public override afterAction(action: Action) {
        if (action.id === "pistol") {
            this.bullets.value = Math.max(0, this.bullets.value - 1)
        }
    }

    public override reset() {
        this.bullets.value = MAGAZINE
    }
}
