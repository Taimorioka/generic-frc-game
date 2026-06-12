import { playSound } from './audio.js';
import { Robot } from './robot.js';
import {
    BOT_MODELS, S, FIELD_W, FIELD_H, WALL_VISUAL, BALL_R, HUB_S,
    BUMP_W, BUMP_L, BAR_L, TRENCH_L, RED_SHOOT_LIMIT, BLUE_SHOOT_LIMIT,
    TOWER_OFFSET, TOWER_DIM, TOWER_WALL_DEPTH, DEPOT_W, DEPOT_H,
    MATCH_PHASES, SHIFT_STATES, START_LABELS
} from './constants.js';
import {
    obstacles, zones, initField,
    getRedStartPos, getBlueStartPos,
    getCenterBallPositions, getDepotBallPositions
} from './field.js';
import {
    getOBB,
    getOBB_AABB,
    collideOBB_AABB,
    collideOBB_OBB,
    circleOBBCollision,
    circleRectCollision,
    resolveBallCollision,
    resolveCollisionRobots,
} from './physics.js';
import { tickMatch, updateHubUI, updateHudBar, triggerShiftFlash, getPulseColor } from './timer.js';

const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');
canvas.width = FIELD_W + (WALL_VISUAL * 2);
canvas.height = FIELD_H + (WALL_VISUAL * 2);

let matchRunning = false, startCountdown = 0, countdownInterval = null, matchElapsed = 0, endCooldown = 0;
let autoPhaseEnded = false, autoWinner = 'red', autoScoreRed = 0, autoScoreBlue = 0;
let currentPhaseIdx = -1;
let sameTeamMode = false;
let p2Enabled = true;
let p1Input = 'keyboard';
let p2Input = 'keyboard2';
let p1StartIdx = 0, p2StartIdx = 0;
let p1UnstickUsed = false, p2UnstickUsed = false;
let p1FreezeUntil = 0, p2FreezeUntil = 0;
let gamepads = [null, null];
let p1GamepadIndex = 0;
let p2GamepadIndex = 1;
let gamepadStatusDiv = null;

let botRed = new Robot(80, FIELD_H/2 - 14, '2910', 0);
let botBlue = new Robot(FIELD_W - 115, FIELD_H/2 - 14, '2910', Math.PI);
let balls = [], projectiles = [], scoringBalls = []
let scoreRed = 0, scoreBlue = 0;
const keys = {};

window.matchRunning = matchRunning;
window.currentPhaseIdx = currentPhaseIdx;
window.matchElapsed = matchElapsed;
window.autoPhaseEnded = autoPhaseEnded;
window.autoWinner = autoWinner;
window.autoScoreRed = autoScoreRed;
window.autoScoreBlue = autoScoreBlue;
window.zones = zones;
window.projectiles = projectiles;
window.FIELD_W = FIELD_W;
window.FIELD_H = FIELD_H;
window.HUB_S = HUB_S;
window.RED_SHOOT_LIMIT = RED_SHOOT_LIMIT;
window.BLUE_SHOOT_LIMIT = BLUE_SHOOT_LIMIT;

function addElement(x, y, w, h, type, side) {
    const el = { x, y, w, h, type, side };
    if (['hub', 'barrier', 'trench', 'towerWall'].includes(type)) obstacles.push(el);
    zones.push(el);
}

function buildLane(x, hubY, side, isTop) {
    const bumpY = isTop ? hubY - BUMP_L : hubY + HUB_S;
    addElement(x, bumpY, BUMP_W, BUMP_L, 'bump', side);
    const barY = isTop ? bumpY - BAR_L : bumpY + BUMP_L;
    addElement(x, barY, BUMP_W, BAR_L, 'barrier', side);
    addElement(x + (BUMP_W/2) - (15 * S), isTop ? barY - TRENCH_L : barY + BAR_L, 30 * S, TRENCH_L, 'trench', side);
}

function spawnBalls() {
    balls = [];
    for (let pos of getCenterBallPositions()) {
        balls.push({
            x: pos.x, y: pos.y, r: BALL_R,
            vx: 0, vy: 0, isStatic: true,
            frictionMod: 1.0, wasOnBump: false, owner: null
        });
    }
    for (let pos of getDepotBallPositions()) {
        balls.push({
            x: pos.x, y: pos.y, r: BALL_R,
            vx: 0, vy: 0, isStatic: true,
            frictionMod: 1.0, wasOnBump: false, owner: null
        });
    }
}

function getInputs(type, playerId) {
    let x=0, y=0, rot=0, act=false, toggleIn=false;
    if (startCountdown > 0 || endCooldown > 0) return {x, y, rot, act, toggleIn};
    if (type === 'keyboard') {
        if (keys['KeyW']) y = -1; if (keys['KeyS']) y = 1; if (keys['KeyA']) x = -1; if (keys['KeyD']) x = 1;
        if (keys['KeyQ']) rot = -1; if (keys['KeyE']) rot = 1;
        if (keys['Space']) act = true;
        if (keys['KeyX']) toggleIn = true;
    } else if (type === 'keyboard2') {
        if (keys['ArrowUp']) y = -1; if (keys['ArrowDown']) y = 1; if (keys['ArrowLeft']) x = -1; if (keys['ArrowRight']) x = 1;
        if (keys['KeyN']) rot = -1; if (keys['KeyM']) rot = 1;
        if (keys['ShiftRight']) act = true;
        if (keys['KeyL']) toggleIn = true;
    } else if (type === 'controller') {
        const gpIdx = (playerId === 0) ? p1GamepadIndex : p2GamepadIndex;
        const gp = navigator.getGamepads ? navigator.getGamepads()[gpIdx] : null;
        if (gp) {
            if (gp.axes.length > 1) { x = gp.axes[0] || 0; y = gp.axes[1] || 0; }
            if (gp.axes.length > 2) rot = gp.axes[2] || 0;
            const deadzone = 0.18;
            if (Math.abs(x) < deadzone) x = 0;
            if (Math.abs(y) < deadzone) y = 0;
            if (Math.abs(rot) < deadzone) rot = 0;
            const b = gp.buttons;
            const rightTrigger = (b[7] && b[7].value) || 0;
            const faceButton = (b[0] && b[0].pressed) || (b[1] && b[1].pressed) || (b[2] && b[2].pressed) || (b[3] && b[3].pressed);
            act = rightTrigger > 0.3 || faceButton;
            const leftTrigger = (b[6] && b[6].value) || 0;
            toggleIn = leftTrigger > 0.5;
        }
    }
    return {x, y, rot, act, toggleIn};
}

function resetBots() {
    let rPos = getRedStartPos(p1StartIdx);
    botRed.x = rPos.x; botRed.y = rPos.y;
    botRed.vx = 0; botRed.vy = 0;
    botRed.vAngle = 0;
    botRed.angle = rPos.a;
    botRed.prevIntakeInput = false;

    if (p2Enabled) {
        let bPos = getBlueStartPos(p2StartIdx, sameTeamMode);
        botBlue.x = bPos.x; botBlue.y = bPos.y;
        botBlue.angle = bPos.a;
        botBlue.vx = 0; botBlue.vy = 0;
        botBlue.vAngle = 0;
        botBlue.prevIntakeInput = false;
    }
    p1FreezeUntil = 0; p2FreezeUntil = 0;
}

function update() {
    tickMatch();
    updateHudBar();
    const now = Date.now();
    let p1State = getInputs(p1Input, 0);
    let p2State = getInputs(p2Input, 1);
    if (now < p1FreezeUntil) p1State = {x:0,y:0,rot:0,act:false,toggleIn:false};
    if (now < p2FreezeUntil) p2State = {x:0,y:0,rot:0,act:false,toggleIn:false};
    botRed.update(p1State.x, p1State.y, p1State.rot, p1State.act, p1State.toggleIn, 'red', obstacles, zones, botBlue);
    if (p2Enabled) botBlue.update(p2State.x, p2State.y, p2State.rot, p2State.act, p2State.toggleIn, sameTeamMode ? 'red' : 'blue', obstacles, zones, botRed);
    if (p2Enabled) {
        const obbRed = getOBB(botRed);
        const obbBlue = getOBB(botBlue);
        const collision = collideOBB_OBB(obbRed, obbBlue);
        if (collision.colliding) {
            resolveCollisionRobots(botRed, botBlue, collision);
            botRed.x = Math.max(0, Math.min(FIELD_W - botRed.model.w, botRed.x));
            botRed.y = Math.max(0, Math.min(FIELD_H - botRed.model.h, botRed.y));
            botBlue.x = Math.max(0, Math.min(FIELD_W - botBlue.model.w, botBlue.x));
            botBlue.y = Math.max(0, Math.min(FIELD_H - botBlue.model.h, botBlue.y));
        }
    }
    scoringBalls = scoringBalls.filter(sb => {
        if (now >= sb.exitTime) {
            let dir = sb.side === 'red' ? 1 : -1, eS = 4 + Math.random()*0.9, eA = (Math.random()-0.5)*0.8;
            balls.push({
                x: sb.side==='red' ? sb.hubX+HUB_S+BALL_R+2 : sb.hubX-BALL_R-2,
                y: sb.hubY+HUB_S/2,
                r: BALL_R,
                vx: Math.cos(eA)*(dir*eS),
                vy: Math.sin(eA)*eS,
                isStatic: false,
                frictionMod: 0.985,
                rollTimer: now + 1500,
                wasOnBump: false,
                owner: sb.side,
                noCollideUntil: now + 300
            });
            return false;
        }
        return true;
    });
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            if (balls[i].noCollideUntil && now < balls[i].noCollideUntil) continue;
            if (balls[j].noCollideUntil && now < balls[j].noCollideUntil) continue;
            resolveBallCollision(balls[i], balls[j]);
        }
    }
    balls = balls.filter(b => {
        let onB = false;
        zones.forEach(z => { if (z.type==='bump' && b.x>z.x && b.x<z.x+z.w && b.y>z.y && b.y<z.y+z.h) { onB = true; b.isStatic = false; b.vx += (b.x<z.x+z.w/2)?-0.12:0.12; } });
        if (!onB && b.wasOnBump) { b.vx *= 0.15; b.vy *= 0.15; } b.wasOnBump = onB;
        if (!b.isStatic) { b.x += b.vx; b.y += b.vy; let f = (b.rollTimer && now < b.rollTimer) ? b.frictionMod : (onB?0.96:0.96); b.vx *= f; b.vy *= f; if (Math.hypot(b.vx, b.vy) < 0.15) { b.vx=0; b.vy=0; b.isStatic=true; } }
        if (b.x < b.r) { b.x = b.r + 0.1; b.vx = Math.max(Math.abs(b.vx) * 0.5, 1.0); b.isStatic = false; }
        if (b.x > FIELD_W - b.r) { b.x = FIELD_W - b.r - 0.1; b.vx = -Math.max(Math.abs(b.vx) * 0.5, 1.0); b.isStatic = false; }
        if (b.y < b.r) { b.y = b.r + 0.1; b.vy = Math.max(Math.abs(b.vy) * 0.5, 1.0); b.isStatic = false; }
        if (b.y > FIELD_H - b.r) { b.y = FIELD_H - b.r - 0.1; b.vy = -Math.max(Math.abs(b.vy) * 0.5, 1.0); b.isStatic = false; }
        obstacles.forEach(o => {
            if (o.type !== 'trench') {
                let col = circleRectCollision(b, o);
                if (col.hit) {
                    b.isStatic = false;
                    b.vx *= 0.8;
                    b.vy *= 0.8;
                    b.x += col.nx * col.overlap;
                    b.y += col.ny * col.overlap;
                }
            }
        });
        let activeBots = p2Enabled ? [botRed, botBlue] : [botRed];
        for(let bot of activeBots) {
            let alliance = bot === botRed ? 'red' : (sameTeamMode ? 'red' : 'blue');
            let ix, iy;
            if (bot.name === 'Blitz') {
                let intakeAngleOffset = bot.intakeSide === 'right' ? Math.PI/2 : -Math.PI/2;
                ix = (bot.x+bot.model.w/2) + Math.cos(bot.angle + intakeAngleOffset)*(bot.model.w/2+5);
                iy = (bot.y+bot.model.h/2) + Math.sin(bot.angle + intakeAngleOffset)*(bot.model.w/2+5);
            } else {
                ix = (bot.x+bot.model.w/2) + Math.cos(bot.angle)*(bot.model.w/2+10);
                iy = (bot.y+bot.model.h/2) + Math.sin(bot.angle)*(bot.model.w/2+10);
            }
            if (Math.hypot(b.x-ix, b.y-iy)<9 && bot.inventory<bot.model.capacity) {
                bot.inventory++;
                return false;
            }
            const obb = getOBB(bot);
            let rCol = circleOBBCollision(b, obb);
            if (rCol.hit) {
                b.isStatic = false;
                b.owner = alliance;
                b.x += rCol.nx * rCol.overlap;
                b.y += rCol.ny * rCol.overlap;
                const robotCenter = { x: bot.x + bot.model.w/2, y: bot.y + bot.model.h/2 };
                const ballToCenter = { x: robotCenter.x - b.x, y: robotCenter.y - b.y };
                const robotVelAtContact = {
                    x: bot.vx - bot.vAngle * ballToCenter.y,
                    y: bot.vy + bot.vAngle * ballToCenter.x
                };
                const relVelX = b.vx - robotVelAtContact.x;
                const relVelY = b.vy - robotVelAtContact.y;
                const velAlong = relVelX * rCol.nx + relVelY * rCol.ny;
                if (velAlong < 0) {
                    const e = 0.5;
                    const mBall = 1, mRobot = 3;
                    const impulse = -(1 + e) * velAlong / (1/mBall + 1/mRobot);
                    b.vx += (impulse / mBall) * rCol.nx;
                    b.vy += (impulse / mBall) * rCol.ny;
                }
            }
        }
        let speed = Math.hypot(b.vx, b.vy);
        if (speed > 25) {
            b.vx = (b.vx / speed) * 25;
            b.vy = (b.vy / speed) * 25;
        }
        return true;
    });
    projectiles = projectiles.filter(p => {
        p.x+=p.vx; p.y+=p.vy; if (p.isPass) { p.vx*=0.975; p.vy*=0.975; }
        if (p.x<p.r || p.x>FIELD_W-p.r) p.vx*=-0.4; if (p.y<p.r || p.y>FIELD_H-p.r) p.vy*=-0.4;
        obstacles.forEach(o => { if (o.type==='hub' && !p.isPass && o.side!==p.owner) { let col = circleRectCollision(p, o); if(col.hit){p.vx*=-0.2;p.vy*=-0.2;} } });
        let scored = false;
        zones.forEach(z => {
            if (z.type === 'hub' && z.side === p.owner && !p.isPass && Math.hypot(p.x-(z.x+z.w/2), p.y-(z.y+z.h/2)) < HUB_S/2) {
                scoringBalls.push({ exitTime: now + 300, hubX: z.x, hubY: z.y, side: z.side }); scored = true;
                let isHubActive = p.owner === 'red' ? window.hubRedActive : window.hubBlueActive;
                if (matchRunning && isHubActive) {
                    if(p.owner === 'red') { scoreRed++; document.getElementById('scoreRedDisplay').innerText = scoreRed; if (!autoPhaseEnded) autoScoreRed++; }
                    else { scoreBlue++; document.getElementById('scoreBlueDisplay').innerText = scoreBlue; if (!autoPhaseEnded) autoScoreBlue++; }
                }
            }
        });
        if (p.isPass && Math.hypot(p.vx, p.vy) < 0.95) { balls.push({ x: p.x, y: p.y, r: BALL_R, vx: p.vx*0.35, vy: p.vy*0.35, isStatic: false, wasOnBump: false, owner: p.owner }); return false; }
        return !scored;
    });
    window.projectiles = projectiles;
}

function draw() {
    ctx.clearRect(0,0, canvas.width, canvas.height);
    ctx.fillStyle = "#111";
    ctx.fillRect(0,0, canvas.width, canvas.height);
    ctx.fillStyle = "#222";
    ctx.fillRect(0,0, canvas.width, WALL_VISUAL);
    ctx.fillRect(0, canvas.height-WALL_VISUAL, canvas.width, WALL_VISUAL);
    ctx.fillRect(0,0, WALL_VISUAL, canvas.height);
    ctx.fillRect(canvas.width-WALL_VISUAL,0, WALL_VISUAL, canvas.height);
    ctx.save();
    ctx.translate(WALL_VISUAL, WALL_VISUAL);
    zones.forEach(z => {
        const c = z.side === 'red' ? '239, 68, 68' : '59, 130, 246';
        if (z.type === 'hub') {
            const act = matchRunning ? (z.side === 'red' ? window.hubRedActive : window.hubBlueActive) : true;
            ctx.globalAlpha = act ? 1.0 : 0.4;
            ctx.strokeStyle = `rgb(${c})`;
            ctx.lineWidth = 4;
            ctx.strokeRect(z.x, z.y, z.w, z.h);
            ctx.beginPath();
            ctx.fillStyle = "white";
            for(let i=0; i<6; i++) {
                let a = (Math.PI/3)*i;
                let px = (z.x+z.w/2) + (z.w/2)*Math.cos(a);
                let py = (z.y+z.h/2) + (z.w/2)*Math.sin(a);
                if(i===0) ctx.moveTo(px,py);
                else ctx.lineTo(px,py);
            }
            ctx.fill();
            ctx.globalAlpha = 1.0;
            if (matchRunning && !act) {
                ctx.font = 'bold 18px "Segoe UI", system-ui';
                ctx.textAlign = 'center';
                ctx.shadowBlur = 0;
                const textX = z.x + z.w/2;
                const textY = z.y + z.h/2 + 6;
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                const textWidth = ctx.measureText('INACTIVE').width;
                ctx.fillRect(textX - textWidth/2 - 8, textY - 16, textWidth + 16, 24);
                ctx.fillStyle = `rgb(${c})`;
                ctx.fillText('INACTIVE', textX, textY);
                ctx.fillStyle = 'white';
            }
        } else if (z.type === 'barrier' || z.type === 'towerWall') {
            ctx.fillStyle = `rgb(${c})`;
            ctx.fillRect(z.x, z.y, z.w, z.h);
        } else if (z.type === 'trench') {
            ctx.fillStyle = `rgba(${c}, 0.2)`;
            ctx.fillRect(z.x, z.y, z.w, z.h);
            ctx.strokeStyle = `rgba(${c}, 0.5)`;
            ctx.lineWidth = 2;
            ctx.strokeRect(z.x, z.y, z.w, z.h);
        } else if (z.type === 'tower') {
            ctx.fillStyle = "#222";
            ctx.fillRect(z.x, z.y, z.w, z.h);
            ctx.strokeStyle = "#444";
            ctx.lineWidth = 2;
            ctx.strokeRect(z.x, z.y, z.w, z.h);
        } else if (z.type === 'depot') {
            ctx.fillStyle = `rgba(${c}, 0.15)`;
            ctx.fillRect(z.x, z.y, z.w, z.h);
            ctx.strokeStyle = `rgba(${c}, 0.8)`;
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 2;
            ctx.strokeRect(z.x, z.y, z.w, z.h);
            ctx.setLineDash([]);
        } else {
            ctx.fillStyle = `rgba(${c}, 0.2)`;
            ctx.fillRect(z.x, z.y, z.w, z.h);
        }
    });
    if (Date.now() < p1FreezeUntil && matchRunning) {
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.3;
    }
    botRed.draw(ctx, 'red');
    ctx.globalAlpha = 1.0;
    if (p2Enabled) {
        if (Date.now() < p2FreezeUntil && matchRunning) {
            ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.3;
        }
        botBlue.draw(ctx, sameTeamMode ? 'red' : 'blue');
        ctx.globalAlpha = 1.0;
    }
    ctx.fillStyle = "#fbbf24";
    balls.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); });
    projectiles.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill(); });

    const robots = p2Enabled ? [botRed, botBlue] : [botRed];
    for (let bot of robots) {
        if (bot.inventory >= 85) {
            ctx.save();
            ctx.font = 'bold 32px "Segoe UI", system-ui';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 0;
            const worldX = bot.x + bot.model.w/2;
            const worldY = bot.y + bot.model.h/2 - bot.model.h/2 - 10;
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeText('⚠', worldX, worldY);
            ctx.fillStyle = '#ff0000';
            ctx.fillText('⚠', worldX, worldY);
            ctx.restore();
        }
    }
    ctx.restore();
    requestAnimationFrame(draw);
}

function handleGamepadConnected(e) {
    gamepads[e.gamepad.index] = e.gamepad;
    updateGamepadStatusUI();
}
function handleGamepadDisconnected(e) {
    gamepads[e.gamepad.index] = null;
    updateGamepadStatusUI();
}
function updateGamepadStatusUI() {
    if (!gamepadStatusDiv) {
        const wrapper = document.querySelector('.controls-wrapper');
        if (wrapper) {
            gamepadStatusDiv = document.createElement('div');
            gamepadStatusDiv.style.marginTop = '8px';
            gamepadStatusDiv.style.fontSize = '0.7rem';
            gamepadStatusDiv.style.color = '#aaa';
            wrapper.insertBefore(gamepadStatusDiv, wrapper.firstChild);
        } else return;
    }
    const connected = gamepads.map((gp, i) => gp ? `🎮 ${i}` : `❌ ${i}`).join(' ');
    gamepadStatusDiv.innerHTML = `Gamepads: ${connected}<br>P1 uses index ${p1GamepadIndex} | P2 uses index ${p2GamepadIndex}`;
}
function addGamepadAssignButtons() {
    const panel = document.getElementById('control-panel');
    if (!panel || document.getElementById('p1-gamepad-assign')) return;
    const p1Btn = document.createElement('button');
    p1Btn.id = 'p1-gamepad-assign';
    p1Btn.className = 'red-team';
    p1Btn.innerHTML = `P1 Gamepad: ${p1GamepadIndex}`;
    p1Btn.onclick = () => {
        p1GamepadIndex = (p1GamepadIndex + 1) % 4;
        p1Btn.innerHTML = `P1 Gamepad: ${p1GamepadIndex}`;
        updateGamepadStatusUI();
    };
    const p2Btn = document.createElement('button');
    p2Btn.id = 'p2-gamepad-assign';
    p2Btn.className = 'blue-team';
    p2Btn.innerHTML = `P2 Gamepad: ${p2GamepadIndex}`;
    p2Btn.onclick = () => {
        p2GamepadIndex = (p2GamepadIndex + 1) % 4;
        p2Btn.innerHTML = `P2 Gamepad: ${p2GamepadIndex}`;
        updateGamepadStatusUI();
    };
    const p1InputBtn = document.getElementById('p1-input-toggle');
    if (p1InputBtn) p1InputBtn.parentNode.insertBefore(p1Btn, p1InputBtn.nextSibling);
    const p2InputBtn = document.getElementById('p2-input-toggle');
    if (p2InputBtn) p2InputBtn.parentNode.insertBefore(p2Btn, p2InputBtn.nextSibling);
}

window.addEventListener('keydown', e => { keys[e.code] = true; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); }, { passive: false });
window.addEventListener('keyup', e => { keys[e.code] = false; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); }, { passive: false });
window.addEventListener('blur', () => { for (let k in keys) keys[k] = false; });
document.querySelectorAll('button').forEach(btn => btn.addEventListener('click', function() { this.blur(); }));

window.addEventListener('gamepadconnected', handleGamepadConnected);
window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

document.getElementById('p1-start-toggle').onclick = function() {
    if (matchRunning || startCountdown > 0) return;
    p1StartIdx = (p1StartIdx + 1) % 3;
    this.innerText = "P1 START: " + START_LABELS[p1StartIdx];
    resetBots();
};
document.getElementById('p2-start-toggle').onclick = function() {
    if (matchRunning || startCountdown > 0) return;
    p2StartIdx = (p2StartIdx + 1) % 3;
    this.innerText = "P2 START: " + START_LABELS[p2StartIdx];
    resetBots();
};
document.getElementById('toggle-controls-btn').onclick = function() {
    const p = document.getElementById('control-panel'); p.classList.toggle('collapsed');
    this.innerText = p.classList.contains('collapsed') ? "☰ SHOW CONTROLS" : "☰ HIDE CONTROLS";
};
document.getElementById('team-mode-toggle').onclick = function() {
    sameTeamMode = !sameTeamMode; this.innerText = "TEAM: " + (sameTeamMode ? "CO-OP (RED)" : "SEPARATE");
    document.getElementById('bot-blue-toggle').className = sameTeamMode ? "red-team" : "blue-team";
    document.getElementById('p2-input-toggle').className = sameTeamMode ? "red-team" : "blue-team";
    document.getElementById('p2-start-toggle').className = sameTeamMode ? "red-team" : "blue-team";
    document.getElementById('p2-unstick').className = sameTeamMode ? "red-team btn-unstick" : "blue-team btn-unstick";
    if (sameTeamMode && p2UnstickUsed) document.getElementById('p2-unstick').classList.add('disabled');
    else if (!sameTeamMode && p2UnstickUsed) document.getElementById('p2-unstick').classList.add('disabled');
    document.getElementById('reset-btn').click();
    document.getElementById('bad-apple').click();
};
document.getElementById('p1-input-toggle').onclick = function() {
    p1Input = p1Input === 'keyboard' ? 'keyboard2' : p1Input === 'keyboard2' ? 'controller' : 'keyboard';
    this.innerText = "P1: " + p1Input.toUpperCase();
};
document.getElementById('p2-input-toggle').onclick = function() {
    p2Input = p2Input === 'keyboard' ? 'keyboard2' : p2Input === 'keyboard2' ? 'controller' : 'keyboard';
    this.innerText = "P2: " + p2Input.toUpperCase();
};
document.getElementById('p2-toggle').onclick = () => {
    p2Enabled = !p2Enabled; let btn = document.getElementById('p2-toggle');
    if (p2Enabled) { btn.innerText = "PLAYER 2: ON"; btn.classList.remove('disabled'); resetBots(); }
    else { btn.innerText = "PLAYER 2: OFF"; btn.classList.add('disabled'); botBlue.x = -1000; botBlue.y = -1000; }
};
document.getElementById('start-btn').onclick = () => {
    if (matchRunning || startCountdown > 0) {
        matchRunning = false; startCountdown = 0; endCooldown = 0; if (countdownInterval) clearInterval(countdownInterval);
        document.getElementById('start-btn').innerText = '▶ START MATCH'; document.getElementById('start-btn').classList.remove('running');
        document.getElementById('match-clock').className = 'stopped'; document.getElementById('match-clock').innerText = "2:20";
        document.getElementById('phase-label').innerText = 'MATCH STOPPED'; document.getElementById('phase-timer').innerText = "";
        document.getElementById('p1-unstick').classList.add('disabled'); document.getElementById('p2-unstick').classList.add('disabled');
        updateHubUI(false, false);
    } else {
        const panel = document.getElementById('control-panel');
        if (!panel.classList.contains('collapsed')) {
            panel.classList.add('collapsed');
            document.getElementById('toggle-controls-btn').innerText = "☰ SHOW CONTROLS";
        }
        scoreRed = 0; scoreBlue = 0; document.getElementById('scoreRedDisplay').innerText = 0; document.getElementById('scoreBlueDisplay').innerText = 0;
        botRed.inventory = 0; botBlue.inventory = 0;
        autoScoreRed = 0; autoScoreBlue = 0; autoPhaseEnded = false; currentPhaseIdx = -1; spawnBalls(); resetBots();
        startCountdown = 3; document.getElementById('match-clock').innerText = startCountdown; document.getElementById('match-clock').className = 'stopped';
        document.getElementById('phase-label').innerText = "MATCH STARTING..."; document.getElementById('phase-timer').innerText = "";
        document.getElementById('start-btn').innerText = '⏹ CANCEL START'; document.getElementById('start-btn').classList.add('running');
        countdownInterval = setInterval(() => {
            startCountdown--;
            if (startCountdown > 0) document.getElementById('match-clock').innerText = startCountdown;
            else {
                clearInterval(countdownInterval); startCountdown = 0; matchElapsed = 0; matchRunning = true;
                window.matchRunning = true;
                playSound('autoStart');
                updateHubUI(true, true); document.getElementById('start-btn').innerText = '⏹ STOP MATCH';
            }
        }, 1000);
    }
};
document.getElementById('bot-red-toggle').onclick = () => {
    if (matchRunning || startCountdown > 0) return;
    const mk = Object.keys(BOT_MODELS); botRed.setModel(mk[(mk.indexOf(botRed.name)+1)%mk.length]); document.getElementById('bot-red-toggle').innerText = "PLAYER 1: " + botRed.name;
};
document.getElementById('bot-blue-toggle').onclick = () => {
    if (matchRunning || startCountdown > 0) return;
    const mk = Object.keys(BOT_MODELS); botBlue.setModel(mk[(mk.indexOf(botBlue.name)+1)%mk.length]); document.getElementById('bot-blue-toggle').innerText = "PLAYER 2: " + botBlue.name;
};
document.getElementById('reset-btn').onclick = () => {
    matchRunning = false; scoreRed = 0; scoreBlue = 0; startCountdown = 0; endCooldown = 0; if (countdownInterval) clearInterval(countdownInterval);
    document.getElementById('scoreRedDisplay').innerText = 0; document.getElementById('scoreBlueDisplay').innerText = 0;
    botRed.inventory = 0; botBlue.inventory = 0;
    matchElapsed = 0; document.getElementById('match-clock').innerText = "2:20"; document.getElementById('match-clock').className = 'stopped';
    document.getElementById('phase-label').innerText = "MATCH NOT STARTED"; document.getElementById('phase-timer').innerText = "";
    document.getElementById('start-btn').innerText = "▶ START MATCH"; document.getElementById('start-btn').classList.remove('running');
    updateHubUI(false, false); spawnBalls(); resetBots();
};


initField();
window.zones = zones;
window.obstacles = obstacles;
spawnBalls();
updateHubUI(false, false);
setInterval(update, 1000/60);
draw();

setInterval(() => {
    const gps = navigator.getGamepads();
    for (let i = 0; i < gps.length; i++) {
        if (gps[i] && (!gamepads[i] || gamepads[i].id !== gps[i].id)) gamepads[i] = gps[i];
        else if (!gps[i] && gamepads[i]) gamepads[i] = null;
    }
    updateGamepadStatusUI();
}, 500);
addGamepadAssignButtons();
const gps = navigator.getGamepads();
for (let i = 0; i < gps.length; i++) if (gps[i]) gamepads[i] = gps[i];
updateGamepadStatusUI();


document.getElementById('control-panel').classList.add('collapsed');
document.getElementById('toggle-controls-btn').innerText = "☰ SHOW CONTROLS";
