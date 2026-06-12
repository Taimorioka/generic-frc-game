import { BOT_MODELS } from './constants.js';
import { getOBB, getOBB_AABB, collideOBB_AABB, collideOBB_OBB, circleOBBCollision } from './physics.js';

export class Robot {
    constructor(x, y, modelKey, startingAngle) {
        this.x = x; this.y = y; this.vx = 0; this.vy = 0;
        this.angle = startingAngle; this.vAngle = 0;
        this.inventory = 0; this.lastShot = 0; this.streamCooldowns = [0, 0, 0, 0];
        this.setModel(modelKey);
        this.disruptedUntil = 0;
        this.intakeSide = 'right';
        this.prevIntakeInput = false;
    }

    setModel(key) {
        this.model = BOT_MODELS[key];
        this.name = key;
        this.intakeSide = 'right';
        this.prevIntakeInput = false;
    }

    update(moveX, moveY, rotInput, rawActInput, rawToggleInput, alliance, obstacles, zones, otherBot = null) {
        if (typeof alliance === 'undefined') alliance = 'red';
        if (isNaN(this.x) || isNaN(this.y) || isNaN(this.vx) || isNaN(this.vy)) {
            this.x = alliance === 'red' ? 80 : FIELD_W - 115;
            this.y = FIELD_H/2 - 14; this.vx = 0; this.vy = 0; this.vAngle = 0;
        }

        let isActionActive = rawActInput;

        if (this.name === 'Blitz') {
            if (rawToggleInput && !this.prevIntakeInput) {
                this.intakeSide = this.intakeSide === 'right' ? 'left' : 'right';
            }
            this.prevIntakeInput = rawToggleInput;
        }

        if (window.matchRunning && window.currentPhaseIdx === 1) {
            this.vx *= 0.5; this.vy *= 0.5; this.vAngle *= 0.5;
            this.x += this.vx; this.y += this.vy; this.angle += this.vAngle;
            return;
        }

        let onBump = false, inTower = false, inDepot = false;
        const myOBB = getOBB(this);
        zones.forEach(z => {
            if (z.type === 'bump' && collideOBB_AABB(myOBB, z).colliding) onBump = true;
            if (z.type === 'tower' && (collideOBB_AABB(myOBB, z).overlap >= 25)) inTower = true;
            if (z.type === 'depot' && collideOBB_AABB(myOBB, z).colliding) inDepot = true;
        });

        const rcx = this.x + this.model.w/2, rcy = this.y + this.model.h/2;
        const isShootingZone = alliance === 'red' ? rcx < RED_SHOOT_LIMIT : rcx > BLUE_SHOOT_LIMIT;

        if (moveX !== 0 || moveY !== 0) {
            const mag = Math.sqrt(moveX*moveX + moveY*moveY);
            if (mag > 0.8) { moveX /= mag; moveY /= mag; }
        }

        let speedMod = inDepot ? 0.65 : 1.0;
        let passSpeedDampen = this.name === 'Blitz' ? 0.60 : (this.name === 'dumper' ? 0.25 : (this.name === '2910' ? 0.25 : (this.name === '3636' ? 0.8 : (this.name === '3636 main season' ? 1.0 : 0.50))));
        this.vx += moveX * (onBump ? 0.18 : (this.model.accel * speedMod * (isActionActive ? passSpeedDampen : 1.0)));
        this.vy += moveY * (onBump ? 0.18 : (this.model.accel * speedMod * (isActionActive ? passSpeedDampen : 1.0)));

        let isLockedOn = true;
        const collidingWithOther = () => {
            if (!otherBot) return false;
            const myOBB = getOBB(this);
            const otherOBB = getOBB(otherBot);
            return collideOBB_OBB(myOBB, otherOBB).colliding;
        };

        const now = Date.now();
        const isDisrupted = now < this.disruptedUntil;
        const canAutoAim = !isDisrupted && isLockedOn;

//        if (isActionActive) {
//            console.log("Action active, inventory:", this.inventory, "inTower:", inTower, "isDisrupted:", isDisrupted, "name:", this.name);
//        }

        if ((this.name === 'dumper' || this.name === '2910') && isActionActive && !inTower && !isDisrupted) {
            let tx = isShootingZone ? zones.find(z => z.type === 'hub' && z.side === alliance).x + HUB_S/2 : (alliance === 'red' ? 40 : FIELD_W - 40);
            let ty = isShootingZone ? zones.find(z => z.type === 'hub' && z.side === alliance).y + HUB_S/2 : (rcy < FIELD_H/2 ? 40 : FIELD_H - 40);
            let targetAngle = Math.atan2(ty - rcy, tx - rcx) + Math.PI;
            let diff = targetAngle - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
            let maxTorque = 0.032 * speedMod * (isShootingZone ? 0.55 : 0.7);
            if (collidingWithOther()) maxTorque *= 0.3;
            let torqueGain = 0.55;
            let torque = Math.max(-maxTorque, Math.min(maxTorque, diff * torqueGain));
            this.vAngle += torque;
            const lockThreshold = 0.07;
            if (Math.abs(diff) > lockThreshold) isLockedOn = false;
        } else if (this.name === 'Blitz' && isActionActive && !inTower && !isDisrupted) {
            let targetAngle;
            if (isShootingZone) {
                let tx = zones.find(z => z.type === 'hub' && z.side === alliance).x + HUB_S/2;
                let ty = zones.find(z => z.type === 'hub' && z.side === alliance).y + HUB_S/2;
                targetAngle = Math.atan2(ty - rcy, tx - rcx);
            } else {
                let targetX = alliance === 'red' ? 0 : FIELD_W;
                let targetY = rcy;
                let hubYCenter = FIELD_H/2;
                let hubClearance = (HUB_S/2) + 40;
                if (Math.abs(rcy - hubYCenter) < hubClearance) {
                    if (rcy < hubYCenter) targetY = hubYCenter - hubClearance;
                    else targetY = hubYCenter + hubClearance;
                }
                targetAngle = Math.atan2(targetY - rcy, targetX - rcx);
            }
            let diff = targetAngle - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
            let maxTorque = 0.040 * speedMod * (isShootingZone ? 0.55 : 0.7);
            if (collidingWithOther()) maxTorque *= 0.3;
            let torqueGain = 0.65;
            let torque = Math.max(-maxTorque, Math.min(maxTorque, diff * torqueGain));
            this.vAngle += torque;
            const lockThreshold = 0.08;
            if (Math.abs(diff) > lockThreshold) isLockedOn = false;
        } else {
            this.vAngle += rotInput * (this.model.rotSpeed * speedMod * (isActionActive ? (isShootingZone ? 0.45 : 0.6) : 1.0));
        }

        this.vx *= 0.91; this.vy *= 0.91; this.vAngle *= 0.78;

        const resolveCollisions = (x, y) => {
            let testBot = { ...this, x, y };
            let iterations = 0;
            const maxIter = 5;
            let anyCollision = false;
            do {
                anyCollision = false;
                let testOBB = getOBB(testBot);
                for (let o of obstacles) {
                    if (o.type === 'trench' && this.inventory < 85) continue;
                    const collision = collideOBB_AABB(testOBB, o);
                    if (collision.colliding) {
                        anyCollision = true;
                        testBot.x -= collision.axis.x * collision.overlap;
                        testBot.y -= collision.axis.y * collision.overlap;
                        testOBB = getOBB(testBot);
                        break;
                    }
                }
                iterations++;
            } while (anyCollision && iterations < maxIter);
            const aabb = getOBB_AABB(testBot);
            if (aabb.minX < 0) testBot.x += (0 - aabb.minX);
            if (aabb.maxX > FIELD_W) testBot.x -= (aabb.maxX - FIELD_W);
            if (aabb.minY < 0) testBot.y += (0 - aabb.minY);
            if (aabb.maxY > FIELD_H) testBot.y -= (aabb.maxY - FIELD_H);
            return { x: testBot.x, y: testBot.y };
        };

        const resultX = resolveCollisions(this.x + this.vx, this.y);
        const finalX = resultX.x;
        const resultY = resolveCollisions(this.x, this.y + this.vy);
        const finalY = resultY.y;
        this.x = finalX;
        this.y = finalY;
        this.angle += this.vAngle;

        if (isActionActive && this.inventory > 0 && !inTower) {
            if ((this.name === 'dumper' || this.name === 'Blitz' || this.name === '2910') && canAutoAim) {
                if (isLockedOn) {
                    if (now - this.lastShot > 500) for(let i=0; i<4; i++) this.streamCooldowns[i] = now + (i * 45);
                    for (let i = 0; i < 4; i++) {
                        if (now >= this.streamCooldowns[i] && this.inventory > 0) {
                            this.fireSingleStream(i, 4, 5.5, isShootingZone, alliance, rcx, rcy);
                            if (this.name === '2910') {
                                this.streamCooldowns[i] = now + 55 + Math.random() * 25; this.lastShot = now;
                            } else {
                                this.streamCooldowns[i] = now + 105 + Math.random() * 55; this.lastShot = now;
                            }
                        }
                    }
                }
            } else if (this.name === 'double turret' && !isDisrupted) {
                if (now - this.lastShot > 500) {
                    this.streamCooldowns[0] = now;
                    this.streamCooldowns[1] = now + 60;
                }
                for (let i = 0; i < 2; i++) {
                    if (now >= this.streamCooldowns[i] && this.inventory > 0) {
                        this.fireSingleStream(i, 2, 15.0, isShootingZone, alliance, rcx, rcy);
                        this.streamCooldowns[i] = now + 120;
                        this.lastShot = now;
                    }
                }
            } else if (!isDisrupted && now - this.lastShot > this.model.fireRate) {
                this.fireStandard(isShootingZone, alliance, rcx, rcy, now);
            }
        }
    }

    fireSingleStream(streamIdx, totalStreams, customSpacing, isShooting, alliance, rcx, rcy) {
        let launchAngle = this.angle;
        let speed = 7;
        if (isShooting) {
            let z = window.zones.find(z => z.type === 'hub' && z.side === alliance);
            launchAngle = Math.atan2((z.y+z.h/2)-rcy, (z.x+z.w/2)-rcx);
        } else {
            if (this.name === 'Blitz') {
                launchAngle = this.angle;
                speed = 13 + Math.random()*2.0;
            } else {
                let tx = alliance==='red'?40:FIELD_W-40, ty = rcy<FIELD_H/2?40:FIELD_H-40;
                launchAngle = Math.atan2(ty-rcy, tx-rcx);
                speed = (9.5 + (Math.hypot(tx-rcx, ty-rcy) * 0.01)) * (0.88 + Math.random()*0.22);
            }
        }
        let pX = -Math.sin(launchAngle), pY = Math.cos(launchAngle);
        let rAngle = launchAngle + (Math.random()-0.5)*(isShooting?0.01:0.08);
        let sSpacing = (streamIdx - (totalStreams - 1) / 2) * customSpacing;
        window.projectiles.push({
            x: rcx + Math.cos(launchAngle)*(this.model.w/2+4) + pX*sSpacing,
            y: rcy + Math.sin(launchAngle)*(this.model.w/2+4) + pY*sSpacing,
            vx: Math.cos(rAngle)*speed,
            vy: Math.sin(rAngle)*speed,
            r: 4,
            owner: alliance,
            isPass: !isShooting
        });
        this.inventory--;
    }

    fireStandard(isShooting, alliance, rcx, rcy, now) {
        let launchAngle = this.angle, speed = 16;
        if (this.name === '3636' || this.name === '3636 main season') {
            speed = 6 + Math.random() * 3;
        }
        if (isShooting) {
            let z = window.zones.find(z => z.type === 'hub' && z.side === alliance);
            if (z) {
                launchAngle = Math.atan2((z.y+z.h/2)-rcy, (z.x+z.w/2)-rcx);
            } else {
                launchAngle = this.angle;
            }
        } else {
            let tx = alliance==='red'?40:FIELD_W-40, ty = rcy<FIELD_H/2?40:FIELD_H-40;
            launchAngle = Math.atan2(ty-rcy, tx-rcx) + (Math.random()-0.5)*0.12;
            speed = (13 + (Math.hypot(tx-rcx, ty-rcy)*0.012)) * (0.85 + Math.random()*0.25);
        }
        window.projectiles.push({
            x: rcx + Math.cos(this.angle)*(this.model.w/2+5),
            y: rcy + Math.sin(this.angle)*(this.model.w/2+5),
            vx: Math.cos(launchAngle)*speed,
            vy: Math.sin(launchAngle)*speed,
            r: 4,
            owner: alliance,
            isPass: !isShooting
        });
        this.inventory--;
        this.lastShot = now;
    }

    draw(ctx, alliance) {
        ctx.save();
        ctx.translate(this.x + this.model.w/2, this.y + this.model.h/2);
        ctx.rotate(this.angle);
        ctx.fillStyle = alliance === 'red' ? '#ef4444' : '#3b82f6';
        ctx.fillRect(-this.model.w/2, -this.model.h/2, this.model.w, this.model.h);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.model.w/2, -this.model.h/2, this.model.w, this.model.h);
        if (this.name === 'Blitz') {
            ctx.fillStyle = "#fbbf24";
            if (this.intakeSide === 'right') {
                ctx.fillRect(-this.model.w/2 + 2, this.model.h/2 - 6, this.model.w - 4, 12);
            } else {
                ctx.fillRect(-this.model.w/2 + 2, -this.model.h/2 - 6, this.model.w - 4, 12);
            }
        } else {
            ctx.fillStyle = "#fbbf24";
            let bY = (this.name === 'dumper' || this.name === '2910') ? -19 : -17.5;
            let bW = (this.name === 'dumper' || this.name === '2910') ? 5 : 6;
            let bH = (this.name === 'dumper' || this.name === '2910') ? 38 : 35;
            ctx.fillRect(this.model.w/2 - 2, bY, bW, bH);
        }
        ctx.rotate(-this.angle);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px Segoe UI";
        ctx.textAlign = "center";
        ctx.fillText(this.inventory, 0, 5);
        ctx.restore();
    }
}