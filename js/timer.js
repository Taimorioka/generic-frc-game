import { MATCH_PHASES, SHIFT_STATES } from './constants.js';
import { playSound } from './audio.js';

export function formatTime(s) {
    s = Math.max(0, Math.ceil(s));
    let m = Math.floor(s / 60), sec = s % 60;
    return m + ":" + (sec < 10 ? "0" : "") + sec;
}

export function getDisplayTime(elapsed) {
    if (elapsed <= 20) return formatTime(20 - elapsed);
    if (elapsed <= 23) return formatTime(23 - elapsed);
    if (elapsed <= 163) return formatTime(163 - elapsed);
    return "0:00";
}

export function triggerShiftFlash() {
    const el = document.getElementById('shift-flash');
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 200);
}

export function updateHubUI(redActive, blueActive) {
    window.hubRedActive = redActive;
    window.hubBlueActive = blueActive;
}

export function getPulseColor(r, g, b) {
    let p = (Math.sin(Date.now() / 250) + 1) / 2;
    return `rgb(${Math.round(r+(255-r)*p)}, ${Math.round(g+(255-g)*p)}, ${Math.round(b+(255-b)*p)})`;
}

export function updateHudBar() {
    let hud = document.getElementById('main-hud');
    if (!window.matchRunning) return hud.style.borderBottomColor = '#fbbf24';
    let currentPhase = MATCH_PHASES[window.currentPhaseIdx];
    if (!currentPhase) return;
    let timeLeft = currentPhase.end - window.matchElapsed;
    if (window.hubRedActive && window.hubBlueActive) hud.style.borderBottomColor = 'rgb(255, 255, 255)';
    else if (window.hubRedActive) hud.style.borderBottomColor = timeLeft <= 10 ? getPulseColor(239, 68, 68) : 'rgb(239, 68, 68)';
    else if (window.hubBlueActive) hud.style.borderBottomColor = timeLeft <= 10 ? getPulseColor(59, 130, 246) : 'rgb(59, 130, 246)';
    else hud.style.borderBottomColor = 'rgb(85, 85, 85)';
}

export function tickMatch() {
    if (!window.matchRunning) return;
    window.matchElapsed += 1/60;

    if (window.matchElapsed >= 163) {
        window.matchRunning = false;
        window.endCooldown = 10;
        playSound('end');
        const endInterval = setInterval(() => { window.endCooldown = Math.max(0, window.endCooldown - 1); if (window.endCooldown === 0) clearInterval(endInterval); }, 1000);
        document.getElementById('match-clock').innerText = "0:00";
        document.getElementById('phase-label').innerText = "MATCH OVER";
        document.getElementById('phase-timer').innerText = "";
        document.getElementById('start-btn').innerText = "▶ START MATCH";
        document.getElementById('start-btn').classList.remove('running');
        document.getElementById('p1-unstick').classList.add('disabled');
        document.getElementById('p2-unstick').classList.add('disabled');
        updateHubUI(false, false);
        return;
    }

    let phaseIdx = MATCH_PHASES.findIndex(p => window.matchElapsed >= p.start && window.matchElapsed < p.end);
    if (phaseIdx === -1) phaseIdx = 7;
    const phase = MATCH_PHASES[phaseIdx];
    const clockEl = document.getElementById('match-clock');
    const timerEl = document.getElementById('phase-timer');
    clockEl.innerText = getDisplayTime(window.matchElapsed);
    document.getElementById('phase-label').innerText = phase.name;
    clockEl.className = phaseIdx === 0 ? 'auto-phase' : (phaseIdx === 1 ? 'delay-phase' : (phaseIdx === 7 ? 'endgame-phase' : ''));
    let phaseTimeLeft = Math.max(0, Math.ceil(phase.end - window.matchElapsed));
    timerEl.innerText = phaseTimeLeft + "s";
    if (window.hubRedActive && window.hubBlueActive) {
        timerEl.style.color = '#fff'; timerEl.style.textShadow = '0 0 10px rgba(255,255,255,0.5)';
    } else if (window.hubRedActive) {
        timerEl.style.color = '#ef4444'; timerEl.style.textShadow = '0 0 10px rgba(239,68,68,0.6)';
    } else if (window.hubBlueActive) {
        timerEl.style.color = '#3b82f6'; timerEl.style.textShadow = '0 0 10px rgba(59,130,246,0.6)';
    } else {
        timerEl.style.color = '#888'; timerEl.style.textShadow = 'none';
    }

    if (!window.autoPhaseEnded && window.matchElapsed >= 20) {
        window.autoPhaseEnded = true;
        playSound('end');
        window.autoWinner = window.autoScoreBlue > window.autoScoreRed ? 'blue' : 'red';
        const badge = document.getElementById('auto-winner');
        badge.innerText = 'AUTO WON BY ' + window.autoWinner.toUpperCase();
        badge.classList.add('visible');
        setTimeout(() => badge.classList.remove('visible'), 3000);
    }

    if (phaseIdx !== window.currentPhaseIdx) {
        window.currentPhaseIdx = phaseIdx;
        let rAct = phase.redActive, bAct = phase.blueActive;
        if (rAct === null) {
            rAct = SHIFT_STATES[window.autoWinner][phaseIdx - 3].redActive;
            bAct = SHIFT_STATES[window.autoWinner][phaseIdx - 3].blueActive;
        }
        updateHubUI(rAct, bAct);
        if (phaseIdx === 2) playSound('teleopStart');
        if (phaseIdx === 7) playSound('endgameStart');
        if (phaseIdx >= 3 && phaseIdx <= 6) { triggerShiftFlash(); playSound('shiftChange'); }
    }
}