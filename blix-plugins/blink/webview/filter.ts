import * as PIXI from 'pixi.js';
import { Filter, getPixiFilter } from './types';

// Apply a series of filters and flatten the result to a sprite.
// This is done so that the filters are applied evenly regardless of scaling.
export function applyFilters(blink: PIXI.Application, content: PIXI.Container, filters: Filter[]) {
    // `renderPadding` is necessary for filters like
    // blur that spread beyond the bounds of the sprite
    const renderPadding = 100;

    // Apply filters
    content.filters = filters.map(getPixiFilter);

    // Normalize offset to fit within renderTexture
    const { x: bx, y: by, width: bw, height: bh } = content.getBounds();
    content.transform.position.x = -bx + renderPadding;
    content.transform.position.y = -by + renderPadding;

    // Render to texture
    const renderTexture = PIXI.RenderTexture.create({
        width: bw + 2 * renderPadding,
        height: bh + 2 * renderPadding,
    });
    blink.renderer.render(content, { renderTexture: renderTexture });

    // Create flattened sprite
    const renderSprite = new PIXI.Sprite(renderTexture);
    renderSprite.setTransform(bx - renderPadding, by - renderPadding);

    return renderSprite;
}