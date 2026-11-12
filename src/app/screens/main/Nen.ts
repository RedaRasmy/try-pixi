import { BaseAbility } from "./Ability"
import type { Action } from "./Actions"
import type { Battle } from "./Battle"
import type { Status } from "./Status"

export const ZETSU = "zetsu"
export const TEN = "ten"
export const REN = "ren"
export const KO = "ko"

const STATUSES: Record<string, Status> = {
    [ZETSU]: {
        id: ZETSU,
        name: "Zetsu",
        color: 0x43eb34,
        dealt: 2,
        taken: 1.5,
    },
    [TEN]: { id: TEN, name: "Ten", color: 0x38bdf8, taken: 0.7, turnsLeft: 3 },
    [REN]: { id: REN, name: "Ren", color: 0xfb923c, dealt: 1.5, turnsLeft: 2 },
    [KO]: {
        id: KO,
        name: "Ko",
        color: 0xef4444,
        dealt: 3,
        taken: 1.5,
        turnsLeft: 2,
        consumeOnAttack: true,
    },
}

export class Nen extends BaseAbility {
    constructor(private battle: Battle) {
        super()

        const sealed = () => (this.has(ZETSU) ? "Aura is sealed (Zetsu)" : null)

        this.actions = [
            {
                kind: "instant",
                id: "zetsu-on",
                name: "Zetsu",
                subtitle: "x2 dmg, hidden",
                apCost: 3,
                forbidsStatus: ZETSU,
                run: () => {
                    for (const id of [TEN, REN, KO]) this.remove(id)
                    this.give(ZETSU)
                },
            },
            {
                kind: "instant",
                id: "zetsu-off",
                name: "Zetsu Off",
                subtitle: "release",
                apCost: 1,
                requiresStatus: ZETSU,
                run: () => this.remove(ZETSU),
            },
            {
                kind: "instant",
                id: "ten",
                name: "Ten",
                subtitle: "takes x0.7",
                apCost: 1,
                forbidsStatus: TEN,
                unavailable: sealed,
                run: () => this.give(TEN),
            },
            {
                kind: "instant",
                id: "ren",
                name: "Ren",
                subtitle: "deals x1.5",
                apCost: 2,
                forbidsStatus: REN,
                unavailable: sealed,
                run: () => this.give(REN),
            },
            {
                kind: "instant",
                id: "ko",
                name: "Ko",
                subtitle: "next hit x3",
                apCost: 2,
                forbidsStatus: KO,
                unavailable: sealed,
                run: () => this.give(KO),
            },
        ] satisfies Action[]
    }

    private has(id: string) {
        return this.battle.player.hasStatus(id)
    }
    private give(id: string) {
        this.battle.player.addStatus({ ...STATUSES[id] })
    }
    private remove(id: string) {
        this.battle.player.removeStatus(id)
    }
}
