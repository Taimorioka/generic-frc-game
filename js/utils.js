export function formatTime(s) {
    s = Math.max(0, Math.ceil(s));
    let m = Math.floor(s / 60), sec = s % 60;
    return m + ":" + (sec < 10 ? "0" : "") + sec;
}