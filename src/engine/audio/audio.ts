import type { PlayOptions } from "@pixi/sound"
import { sound } from "@pixi/sound"

/**
 * Handles short sound special effects, mainly for having its own volume settings.
 * The volume control is only a workaround to make it work only with this type of sound,
 * with a limitation of not controlling volume of currently playing instances - only the new ones will
 * have their volume changed. But because most of sound effects are short sounds, this is generally fine.
 */
export class SFX {
    /** Volume scale for new instances */
    private volume = 1

    /** Play an one-shot sound effect */
    public play(alias: string, options?: PlayOptions) {
        const volume = this.volume * (options?.volume ?? 1)
        sound.play(alias, { ...options, volume })
    }

    /** Set sound effects volume */
    public getVolume() {
        return this.volume
    }

    /** Set sound effects volume. Does not affect instances that are currently playing */
    public setVolume(v: number) {
        this.volume = v
    }
}
