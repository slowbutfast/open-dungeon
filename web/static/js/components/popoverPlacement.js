// Pure obstacle-aware popover placement (gravitational-node-map, 2.3).
//
// DOM-free ESM module. Given an anchor rect, card size, viewport and obstacle
// rects it scores the eight Obsidian-style candidates and returns the best
// (least-occluded, in-viewport) `{ left, top, placement }`.

export const POPOVER_PLACEMENTS = ['R', 'L', 'T', 'B', 'TR', 'BR', 'TL', 'BL'];

function rectOf(anchor) {
    const width = anchor.width ?? anchor.w ?? 0;
    const height = anchor.height ?? anchor.h ?? 0;
    return {
        left: anchor.left ?? anchor.x ?? 0,
        top: anchor.top ?? anchor.y ?? 0,
        width,
        height,
        right: (anchor.left ?? anchor.x ?? 0) + width,
        bottom: (anchor.top ?? anchor.y ?? 0) + height,
    };
}

function candidatePosition(placement, anchor, size, gap) {
    const centreX = anchor.left + anchor.width / 2 - size.width / 2;
    const centreY = anchor.top + anchor.height / 2 - size.height / 2;
    switch (placement) {
        case 'R':
            return { left: anchor.right + gap, top: centreY };
        case 'L':
            return { left: anchor.left - gap - size.width, top: centreY };
        case 'T':
            return { left: centreX, top: anchor.top - gap - size.height };
        case 'B':
            return { left: centreX, top: anchor.bottom + gap };
        case 'TR':
            return { left: anchor.right + gap, top: anchor.top - gap - size.height };
        case 'BR':
            return { left: anchor.right + gap, top: anchor.bottom + gap };
        case 'TL':
            return { left: anchor.left - gap - size.width, top: anchor.top - gap - size.height };
        case 'BL':
            return { left: anchor.left - gap - size.width, top: anchor.bottom + gap };
        default:
            return { left: anchor.right + gap, top: centreY };
    }
}

function overlapArea(a, b) {
    const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
    const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
    if (width <= 0 || height <= 0) return 0;
    return width * height;
}

/**
 * @param {object} options
 * @param {{left:number,top:number,width:number,height:number}} options.anchor
 * @param {{width:number,height:number}} options.size
 * @param {{width:number,height:number}} options.viewport
 * @param {Array<{left:number,top:number,width:number,height:number}>} [options.obstacles]
 * @param {number} [options.margin] side/bottom viewport margin
 * @param {number} [options.topMargin] minimum top edge (e.g. below a top bar)
 * @returns {{left:number,top:number,placement:string}}
 */
export function chooseBestPopoverPosition({
    anchor,
    size,
    viewport,
    obstacles = [],
    gap = 12,
    margin = 8,
    topMargin = margin,
} = {}) {
    const anchorRect = rectOf(anchor || {});
    const card = {
        width: Math.max(1, size?.width ?? 0),
        height: Math.max(1, size?.height ?? 0),
    };
    const view = {
        width: Math.max(1, viewport?.width ?? 1),
        height: Math.max(1, viewport?.height ?? 1),
    };
    const minTop = Math.max(0, topMargin);
    const obstacleRects = (obstacles || []).map(rectOf);
    // The focal node itself is a blocker: a clamped candidate must never end
    // up sitting on top of the orb it describes.
    const blockers = obstacleRects.concat([anchorRect]);

    let best = null;
    POPOVER_PLACEMENTS.forEach((placement, index) => {
        const raw = candidatePosition(placement, anchorRect, card, gap);
        // Clamp inside the viewport, then score the *clamped* card.
        const left = Math.min(
            Math.max(margin, raw.left),
            Math.max(margin, view.width - card.width - margin),
        );
        const top = Math.min(
            Math.max(minTop, raw.top),
            Math.max(minTop, view.height - card.height - margin),
        );
        const rect = { left, top, width: card.width, height: card.height };

        let overflow = 0;
        if (left < margin) overflow += (margin - left) * card.height;
        if (top < minTop) overflow += (minTop - top) * card.width;
        if (left + card.width > view.width - margin) {
            overflow += (left + card.width - (view.width - margin)) * card.height;
        }
        if (top + card.height > view.height - margin) {
            overflow += (top + card.height - (view.height - margin)) * card.width;
        }

        const occlusion = blockers.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle), 0);

        // Stable tie-break: viewport overflow dominates, then occlusion, then
        // candidate order. No distance term: otherwise a tall card prefers the
        // top/bottom candidates purely because its centre is nearer.
        const score = overflow * 100 + occlusion * 100 + index * 0.000001;
        if (best === null || score < best.score) {
            best = { left, top, placement, score };
        }
    });

    return { left: best.left, top: best.top, placement: best.placement };
}
