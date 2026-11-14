import { BaseAbility } from "./Ability"
import type { Action } from "../core/Actions"
import type { Battle } from "../Battle"
import type { Status } from "../core/Status"

export const ZETSU = "zetsu"
export const TEN = "ten"
export const REN = "ren"
export const KO = "ko"
export const EN = "en"
export const EYES = "closed-eyes"

const EN_RADIUS = 4
/** With eyes closed you feel creatures (not Zetsu users) this close */
export const EYES_SENSE = 4

const STATUSES: Record<string, Status> = {
    [ZETSU]: { id: ZETSU, name: "Zetsu", color: 0x43eb34, taken: 1.5 },
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
    [EN]: {
        id: EN,
        name: "En",
        color: 0xa855f7,
        sense: EN_RADIUS,
        turnsLeft: 3,
    },
    [EYES]: { id: EYES, name: "Closed Eyes", color: 0x64748b },
}

/** A fresh copy of a status. `permanent` removes its duration (used by enemies). */
export function makeStatus(id: string, permanent = false): Status {
    const status = { ...STATUSES[id] }
    if (permanent) delete status.turnsLeft
    return status
}

/** Select the card, then click yourself */
const SELF = { minRange: 0, maxRange: 0 } as const

export class Nen extends BaseAbility {
    constructor(private battle: Battle) {
        super()

        const sealed = () => (this.has(ZETSU) ? "Aura is sealed (Zetsu)" : null)

        this.actions = [
            {
                ...SELF,
                id: "zetsu-on",
                name: "Zetsu",
                group: "Nen",
                subtitle: "hide, takes x1.5",
                description:
                    "Hide your presence: enemies without line of sight (or En) lose track of you. You take x1.5 damage. Seals Ten, Ren, Ko and En. Together with closed eyes it starts Laplace Demon.",
                apCost: 3,
                blind: true,
                forbidsStatus: ZETSU,
                run: () => {
                    for (const id of [TEN, REN, KO, EN]) this.remove(id)
                    this.give(ZETSU)
                    this.battle.player.setGhost(true)
                },
            },
            {
                ...SELF,
                id: "zetsu-off",
                name: "Zetsu Off",
                group: "Nen",
                subtitle: "release",
                description: "Stop hiding. Ends Laplace Demon if it is active.",
                apCost: 1,
                blind: true,
                requiresStatus: ZETSU,
                run: () => {
                    this.remove(ZETSU)
                    this.battle.player.setGhost(false)
                },
            },
            {
                ...SELF,
                id: "ten",
                name: "Ten",
                group: "Nen",
                subtitle: "takes x0.7",
                description:
                    "Wrap yourself in aura: you take x0.7 damage for 3 turns.",
                apCost: 1,
                forbidsStatus: TEN,
                unavailable: sealed,
                run: () => this.give(TEN),
            },
            {
                ...SELF,
                id: "ren",
                name: "Ren",
                group: "Nen",
                subtitle: "deals x1.5",
                description:
                    "Amplify your aura: you deal x1.5 damage for 2 turns.",
                apCost: 2,
                forbidsStatus: REN,
                unavailable: sealed,
                run: () => this.give(REN),
            },
            {
                ...SELF,
                id: "ko",
                name: "Ko",
                group: "Nen",
                subtitle: "next hit x3",
                description:
                    "Concentrate aura into one strike: your next attack deals x3, but you take x1.5 until it is spent.",
                apCost: 2,
                forbidsStatus: KO,
                unavailable: sealed,
                run: () => this.give(KO),
            },
            {
                ...SELF,
                id: "en",
                name: "En",
                group: "Nen",
                subtitle: `sense ${EN_RADIUS} tiles`,
                description: `Extend your aura ${EN_RADIUS} tiles: you see everything inside it, even through walls, Zetsu users and with closed eyes. It cannot reveal the real body of a Laplace caster.`,
                apCost: 2,
                forbidsStatus: EN,
                unavailable: sealed,
                run: () => this.give(EN),
            },
            {
                ...SELF,
                id: "close-eyes",
                name: "Close Eyes",
                group: "Senses",
                subtitle: "dark / preview",
                description: `The board goes dark. You still feel creatures within ${EYES_SENSE} tiles (not Zetsu users) and everything inside your En. With Zetsu on (and enough charge) it starts Laplace Demon and replays the coming turn.`,
                apCost: 1,
                forbidsStatus: EYES,
                run: () => this.give(EYES),
            },
            {
                ...SELF,
                id: "open-eyes",
                name: "Open Eyes",
                group: "Senses",
                subtitle: "see again",
                description:
                    "Open your eyes. The preview disappears, the ability stays active.",
                apCost: 1,
                blind: true,
                requiresStatus: EYES,
                run: () => this.remove(EYES),
            },
        ] satisfies Action[]
    }

    // ---------- Eyes ----------

    public override blocksMovement() {
        return this.has(EYES) ? "Your eyes are closed" : null
    }

    /** With closed eyes only `blind` actions work */
    public override blocksAction(action: Action) {
        return this.has(EYES) && !action.blind ? "Your eyes are closed" : null
    }

    /** Eyes closed = darkness, except the tiles your En can feel */
    public override visibleTiles() {
        if (!this.has(EYES)) return null
        const p = this.battle.player
        return p.senseRadius > 0
            ? this.battle.board.tilesInRange(p, 0, p.senseRadius, true)
            : []
    }

    private has(id: string) {
        return this.battle.player.hasStatus(id)
    }
    private give(id: string) {
        this.battle.player.addStatus(makeStatus(id))
    }
    private remove(id: string) {
        this.battle.player.removeStatus(id)
    }
}
