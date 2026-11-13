import { BaseAbility } from "./Ability"
import type { Action } from "./Actions"
import type { Battle } from "./Battle"
import type { Status } from "./Status"

export const ZETSU = "zetsu"
export const TEN = "ten"
export const REN = "ren"
export const KO = "ko"
export const EN = "en"
export const EYES = "closed-eyes"

const EN_RADIUS = 4

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

export class Nen extends BaseAbility {
    constructor(private battle: Battle) {
        super()

        const sealed = () => (this.has(ZETSU) ? "Aura is sealed (Zetsu)" : null)

        this.actions = [
            {
                kind: "instant",
                id: "zetsu-on",
                name: "Zetsu",
                subtitle: "hidden, takes x1.5",
                apCost: 3,
                forbidsStatus: ZETSU,
                run: () => {
                    for (const id of [TEN, REN, KO, EN]) this.remove(id)
                    this.give(ZETSU)
                    this.battle.player.setGhost(true)
                },
            },
            {
                kind: "instant",
                id: "zetsu-off",
                name: "Zetsu Off",
                subtitle: "release",
                apCost: 1,
                requiresStatus: ZETSU,
                run: () => {
                    this.remove(ZETSU)
                    this.battle.player.setGhost(false)
                },
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
            {
                kind: "instant",
                id: "en",
                name: "En",
                subtitle: `sense ${EN_RADIUS} tiles`,
                apCost: 2,
                forbidsStatus: EN,
                unavailable: sealed,
                run: () => this.give(EN),
            },
            {
                kind: "instant",
                id: "close-eyes",
                name: "Close Eyes",
                subtitle: "darkness / preview",
                apCost: 1,
                forbidsStatus: EYES,
                run: () => {
                    this.give(EYES)
                    for (const a of this.battle.abilities) a.onEyesClosed()
                },
            },
            {
                kind: "instant",
                id: "open-eyes",
                name: "Open Eyes",
                subtitle: "see again",
                apCost: 1,
                requiresStatus: EYES,
                run: () => this.remove(EYES),
            },
        ] satisfies Action[]
    }

    // ---------- Eyes ----------

    public override blocksMovement() {
        return this.has(EYES) ? "Your eyes are closed" : null
    }

    public override blocksAction(action: Action) {
        return this.has(EYES) && action.id !== "open-eyes"
            ? "Your eyes are closed"
            : null
    }

    /** Eyes closed = darkness, except the tiles your En can feel */
    public override visibleTiles() {
        if (!this.has(EYES)) return null
        const p = this.battle.player
        return p.senseRadius > 0
            ? this.battle.board.tilesInRange(p, 0, p.senseRadius, true)
            : []
    }

    public override onTurnEnd() {
        this.remove(EYES)
    }

    // ---------- Helpers ----------

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
