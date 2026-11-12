import { Sprite } from "pixi.js"

export type IconKind = "star" | "move"

/** Icon name -> image file. Add a new icon here and in IconKind. */
const ICON_FILES: Record<IconKind, string> = {
    star: "icon-ap.png",
    move: "icon-mp.png",
}

/** Every icon is scaled so its biggest side is this many pixels */
const ICON_SIZE = 32

/**
 * @param color optional tint. Only use it with white/silhouette images.
 *              Leave it out for images that already have their own colors.
 */
export function createIcon(kind: IconKind, color?: number, scale = 1) {
    const sprite = Sprite.from(ICON_FILES[kind])
    sprite.anchor.set(0.5)

    // Normalize size so icons of any resolution look the same
    const fit =
        ICON_SIZE / Math.max(sprite.texture.width, sprite.texture.height)
    sprite.scale.set(fit * scale)

    if (color !== undefined) sprite.tint = color
    return sprite
}
