import {
    S, FIELD_W, FIELD_H, BALL_R, HUB_S,
    BUMP_W, BUMP_L, BAR_L, TRENCH_L,
    TOWER_OFFSET, TOWER_DIM, TOWER_WALL_DEPTH,
    DEPOT_W, DEPOT_H, START_LABELS
} from './constants.js';

export let obstacles = [];
export let zones = [];

function addElement(x, y, w, h, type, side) {
    const el = { x, y, w, h, type, side };
    if (['hub', 'barrier', 'trench', 'towerWall'].includes(type)) {
        obstacles.push(el);
    }
    zones.push(el);
}

function buildLane(x, hubY, side, isTop) {
    const bumpY = isTop ? hubY - BUMP_L : hubY + HUB_S;
    addElement(x, bumpY, BUMP_W, BUMP_L, 'bump', side);
    const barY = isTop ? bumpY - BAR_L : bumpY + BUMP_L;
    addElement(x, barY, BUMP_W, BAR_L, 'barrier', side);
    addElement(
        x + (BUMP_W / 2) - (15 * S),
        isTop ? barY - TRENCH_L : barY + BAR_L,
        30 * S,
        TRENCH_L,
        'trench',
        side
    );
}

export function initField() {
    obstacles.length = 0;
    zones.length = 0;

    // Red side
    addElement(156.61 * S, FIELD_H / 2 - HUB_S / 2, HUB_S, HUB_S, 'hub', 'red');
    buildLane(156.61 * S, FIELD_H / 2 - HUB_S / 2, 'red', true);
    buildLane(156.61 * S, FIELD_H / 2 - HUB_S / 2, 'red', false);
    addElement(0, TOWER_OFFSET, TOWER_DIM, TOWER_DIM, 'tower', 'red');
    addElement(TOWER_DIM - TOWER_WALL_DEPTH, TOWER_OFFSET, TOWER_WALL_DEPTH, TOWER_DIM, 'towerWall', 'red');

    // Blue side
    addElement(FIELD_W - (156.61 * S) - HUB_S, FIELD_H / 2 - HUB_S / 2, HUB_S, HUB_S, 'hub', 'blue');
    buildLane(FIELD_W - (156.61 * S) - BUMP_W, FIELD_H / 2 - HUB_S / 2, 'blue', true);
    buildLane(FIELD_W - (156.61 * S) - BUMP_W, FIELD_H / 2 - HUB_S / 2, 'blue', false);
    addElement(FIELD_W - TOWER_DIM, FIELD_H - TOWER_OFFSET - TOWER_DIM, TOWER_DIM, TOWER_DIM, 'tower', 'blue');
    addElement(FIELD_W - TOWER_DIM, FIELD_H - TOWER_OFFSET - TOWER_DIM, TOWER_WALL_DEPTH, TOWER_DIM, 'towerWall', 'blue');

    let redDepotY = (82.32 * S) - (DEPOT_H / 2);
    let blueDepotY = FIELD_H - (82.32 * S) - (DEPOT_H / 2);
    addElement(0, redDepotY, DEPOT_W, DEPOT_H, 'depot', 'red');
    addElement(FIELD_W - DEPOT_W, blueDepotY, DEPOT_W, DEPOT_H, 'depot', 'blue');
}

export function getRedStartPos(startIdx) {
    let x = 156.61 * S - 45;
    let y = FIELD_H / 2 - 17.5;
    if (startIdx === 1) {
        x = 156.61 * S - 20;
        y = (FIELD_H / 2 - HUB_S / 2 - BUMP_L - BAR_L) - (TRENCH_L / 2) - 17.5;
    } else if (startIdx === 2) {
        x = 156.61 * S - 20;
        y = (FIELD_H / 2 + HUB_S / 2 + BUMP_L + BAR_L) + (TRENCH_L / 2) - 17.5;
    }
    return { x, y, a: 0 };
}

export function getBlueStartPos(startIdx, sameTeamMode = false) {
    if (sameTeamMode) {
        let x = 156.61 * S - 45;
        let y = FIELD_H / 2 + 20;
        if (startIdx === 1) {
            x = 156.61 * S - 20;
            y = (FIELD_H / 2 - HUB_S / 2 - BUMP_L - BAR_L) - (TRENCH_L / 2) + 20;
        } else if (startIdx === 2) {
            x = 156.61 * S - 20;
            y = (FIELD_H / 2 + HUB_S / 2 + BUMP_L + BAR_L) + (TRENCH_L / 2) + 20;
        }
        return { x, y, a: 0 };
    }
    let x = FIELD_W - (156.61 * S) + 10;
    let y = FIELD_H / 2 - 17.5;
    if (startIdx === 1) {
        x = FIELD_W - (156.61 * S) - 15;
        y = (FIELD_H / 2 - HUB_S / 2 - BUMP_L - BAR_L) - (TRENCH_L / 2) - 17.5;
    } else if (startIdx === 2) {
        x = FIELD_W - (156.61 * S) - 15;
        y = (FIELD_H / 2 + HUB_S / 2 + BUMP_L + BAR_L) + (TRENCH_L / 2) - 17.5;
    }
    return { x, y, a: Math.PI };
}

export function getCenterBallPositions() {
    const positions = [];
    const startX = (FIELD_W / 2) - (12 * BALL_R * 2) / 2 + BALL_R;
    const startY = (FIELD_H / 2) - (30 * BALL_R * 2) / 2 + BALL_R;
    for (let r = 0; r < 30; r++) {
        if (r >= 14 && r <= 15) continue; // skip the middle two rows (optional)
        for (let c = 0; c < 12; c++) {
            positions.push({
                x: startX + (c * BALL_R * 2),
                y: startY + (r * BALL_R * 2)
            });
        }
    }
    return positions;
}

export function getDepotBallPositions() {
    const positions = [];
    const redDepotY = (82.32 * S) - (DEPOT_H / 2);
    const blueDepotY = FIELD_H - (82.32 * S) - (DEPOT_H / 2);
    const blueDepotX = FIELD_W - DEPOT_W;
    const xStep = DEPOT_W / 4;
    const yStep = DEPOT_H / 6;

    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
            positions.push({
                x: c * xStep + xStep / 2,
                y: redDepotY + r * yStep + yStep / 2
            });
        }
    }
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
            positions.push({
                x: blueDepotX + c * xStep + xStep / 2,
                y: blueDepotY + r * yStep + yStep / 2
            });
        }
    }
    return positions;
}