export interface LevelDef {
    id: string
    name: string
    tagline: string
    /** Map ids in play order (see Maps.ts). The first one is where you start. */
    stages: string[]
    comingSoon?: boolean
}

export const LEVELS: LevelDef[] = [
    {
        id: "escape",
        name: "The Escape",
        tagline:
            "Few doors stand between you and freedom. Every guard is armed.",
        stages: ["yard", "corridor", "armory"],
    },
    {
        id: "monster",
        name: "Monster",
        tagline: "Don't pee yourself.",
        stages: [],
        comingSoon: true,
    },
]
