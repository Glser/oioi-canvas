import i18n from "../../i18n";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const SVG_NS = "http://www.w3.org/2000/svg";
const noise = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
// Every selector is scoped to this component; no host/body styling or remote assets.
const css = `
[data-elastic-resize] { box-sizing:border-box; position:relative; min-width:0; font-family:Arial,Helvetica,sans-serif; }
[data-elastic-resize].epr-scene { width:100%; aspect-ratio:1; overflow:hidden; isolation:isolate; background:#efefef; }
[data-elastic-resize] .epr-stage { position:absolute; left:0; top:0; width:1000px; transform-origin:0 0; }
[data-elastic-resize] .epr-noise { position:absolute; inset:0; pointer-events:none; opacity:.65; filter:contrast(4); mix-blend-mode:soft-light; background-image:url("data:image/svg+xml,${encodeURIComponent(noise)}"); background-size:160px 160px; }
[data-elastic-resize] .epr-panel { box-sizing:border-box; position:absolute; top:17px; right:17px; bottom:17px; background:#fbfbfb; border:1px solid #d4d4d4; border-radius:40px; box-shadow:0 2px 4px #0000000a,inset 0 0 0 1px #ffffffb3; }
[data-elastic-resize].epr-attached { position:absolute; inset:0; pointer-events:none; }
[data-elastic-resize] .epr-grip { box-sizing:border-box; position:absolute; top:17px; bottom:17px; width:32px; margin-left:-16px; padding:0; border:0; background:transparent; cursor:ew-resize; touch-action:none; user-select:none; outline:none; z-index:1; pointer-events:auto; }
[data-elastic-resize].epr-attached .epr-grip { inset:0; margin:0; width:100%; height:100%; }
[data-elastic-resize] .epr-grip[data-disabled] { pointer-events:none; }
[data-elastic-resize] .epr-grip > svg { position:absolute; left:50%; top:50%; width:80px; height:160px; transform:translate(-50%,-50%); overflow:visible; pointer-events:none; }
[data-elastic-resize] .epr-grip::after { content:""; box-sizing:border-box; position:absolute; left:50%; top:50%; width:48px; height:132px; border:2px solid var(--elastic-focus,#666); border-radius:24px; transform:translate(-50%,-50%); pointer-events:none; opacity:0; }
[data-elastic-resize] .epr-grip:focus-visible::after { opacity:1; }
[data-elastic-resize] .epr-live { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; pointer-events:none; }
`;

function makeView(host, attached) {
    const doc = host.ownerDocument;
    const root = doc.createElement("div");
    root.dataset.elasticResize = "";
    root.className = attached ? "epr-attached" : "epr-scene";
    const style = doc.createElement("style");
    style.textContent = css;
    root.append(style);
    let stage = root;
    let panel = attached?.panel;
    if (!attached) {
        stage = doc.createElement("div");
        stage.className = "epr-stage";
        const background = doc.createElement("div");
        background.className = "epr-noise";
        panel = doc.createElement("div");
        panel.className = "epr-panel";
        stage.append(background, panel);
        root.append(stage);
    }
    const controlled = attached?.controls || panel;
    const oldId = controlled.getAttribute("id");
    if (!oldId) controlled.id = `elastic-panel-${doc.defaultView.crypto.randomUUID()}`;
    const ownedId = controlled.id;
    const grip = doc.createElement("div");
    grip.className = "epr-grip";
    grip.setAttribute("role", "separator");
    grip.setAttribute("aria-orientation", "vertical");
    grip.setAttribute("aria-controls", ownedId);
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 80 160");
    svg.setAttribute("aria-hidden", "true");
    const paths = ["var(--elastic-outline,#fff)", "var(--elastic-grip,#c6c6c6)"].map((color) => {
        const path = doc.createElementNS(SVG_NS, "path");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-linecap", "round");
        svg.append(path);
        return path;
    });
    const live = doc.createElement("div");
    live.className = "epr-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    grip.append(svg);
    stage.append(grip);
    root.append(live);
    host.append(root);
    return { root, stage, panel, grip, paths, live, remove() {
        root.remove();
        if (!oldId && controlled.id === ownedId) controlled.removeAttribute("id");
    } };
}

/** Standalone 1000px design scene. DOM is accessed only by this mount call. */
export function createElasticPanelResize(host, options = {}) {
    return createController(host, options, null);
}

/** Attach the same physics/gesture engine to a real sidebar without replacing its content. */
export function attachElasticPanelResize(host, attachment, options = {}) {
    return createController(host, options, attachment);
}

function createController(host, initialOptions, attachment) {
    const { root, stage, panel, grip, paths, live, remove } = makeView(host, attachment);
    const doc = host.ownerDocument;
    const win = doc.defaultView;
    const frame = attachment?.container || root;
    const media = win.matchMedia("(prefers-reduced-motion: reduce)");
    const originalWidth = panel.style.width;
    let options = { ...initialOptions };
    let width = 1000, scale = 1, target = 386.5, position = target, velocity = 0;
    let B = 0, bVelocity = 0, O = 0, oVelocity = 0, S = 0, L = 60, R = 0;
    let excess = 0, speed = 0, lastMove = -Infinity, gesture = null;
    let hovered = false, focused = false, visible = false, hideTimer = 0;
    let raf = 0, lastFrame = 0, disposed = false, suspended = false;
    const rightPanel = !attachment || attachment.side === "right";
    const reduced = () => options.reducedMotion ?? media.matches;
    const bounds = () => {
        if (!attachment) return [width * .276, width * .5];
        const max = Math.min(width, options.maxWidth);
        const min = Math.min(max, options.minWidth);
        return rightPanel ? [width - max, width - min] : [min, max];
    };
    const initialTarget = () => !attachment ? .3865 * width : rightPanel ? width - options.defaultWidth : options.defaultWidth;
    const nominalWidth = () => rightPanel ? width - target : target;
    const percent = () => nominalWidth() / width * 100;
    const localX = (clientX) => (clientX - frame.getBoundingClientRect().left) / scale;
    const rubber = (e) => Math.sign(e) * 15 * (1 - Math.exp(-Math.abs(e) / 35));
    // Invert only the visible rubber displacement when re-grabbing a rebound.
    // Otherwise the first move would rubber-band the already rubber-banded position twice.
    function rawAtPosition() {
        const [min, max] = bounds();
        const legal = clamp(position, min, max);
        const delta = position - legal;
        return legal - Math.sign(delta) * 35 * Math.log1p(-Math.min(Math.abs(delta) / 15, 1 - Number.EPSILON));
    }
    const on = (element, event, handler) => { element.addEventListener(event, handler); listeners.push(() => element.removeEventListener(event, handler)); };
    const listeners = [];

    if (attachment) {
        const initial = options.width ?? options.defaultWidth;
        target = rightPanel ? width - initial : initial;
        position = target;
    }
    function aria() {
        const [min, max] = bounds();
        grip.setAttribute("aria-label", options.label || i18n.t("panelResize.defaultLabel"));
        grip.setAttribute("aria-valuemin", attachment ? ((rightPanel ? width - max : min) / width * 100).toFixed(1) : "50");
        grip.setAttribute("aria-valuemax", attachment ? ((rightPanel ? width - min : max) / width * 100).toFixed(1) : "72.4");
        grip.setAttribute("aria-valuenow", percent().toFixed(1));
        grip.setAttribute("aria-valuetext", i18n.t("panelResize.widthValue", { percent: percent().toFixed(1) }));
    }
    function announce(cancelled = false) {
        const text = `${cancelled ? `${i18n.t("panelResize.cancelled")}，` : ""}${i18n.t("panelResize.widthValue", { percent: percent().toFixed(1) })}`;
        // Clear then append so repeated resets are announced without per-frame live updates.
        live.replaceChildren(doc.createTextNode(text));
        options.onCommit?.(nominalWidth(), { percentage: percent(), cancelled });
    }
    function render() {
        if (attachment) {
            const next = rightPanel ? width - position : position;
            panel.style.width = `${next}px`;
        } else {
            panel.style.left = `${position}px`;
            grip.style.left = `${position}px`;
        }
        const path = `M ${40 + O} ${80 - L / 2} Q ${40 + O + 2 * B} 80 ${40 + O} ${80 + L / 2}`;
        const q = gesture && !reduced() ? clamp(Math.abs(excess) / 80, 0, 1) : 0;
        const d = gesture && !reduced() && win.performance.now() - lastMove <= 70 ? clamp(speed / 60, -1, 1) : 0;
        const m = Math.max(Math.abs(d) * (1 - q), q);
        const channel = Math.round(198 - 39 * m);
        paths.forEach((pathElement, i) => {
            pathElement.setAttribute("d", path);
            pathElement.setAttribute("stroke-width", String((i ? S : S + 2 * R) * (attachment ? .4 : 1)));
            pathElement.setAttribute("opacity", String(R));
        });
        paths[1].setAttribute("stroke", attachment ? `color-mix(in srgb, var(--elastic-grip,#c6c6c6) ${100 - 100 * m}%, var(--elastic-grip-active,#9f9f9f))` : `rgb(${channel} ${channel} ${channel})`);
        aria();
    }
    function stop() {
        if (raf) win.cancelAnimationFrame(raf);
        raf = 0;
        lastFrame = 0;
    }
    function wake() {
        if (raf || disposed || suspended || doc.hidden) return;
        lastFrame = win.performance.now();
        raf = win.requestAnimationFrame(tick);
    }
    function tick(now) {
        raf = 0;
        if (disposed || suspended || doc.hidden) return;
        const dt = Math.min(Math.max((now - lastFrame) / 1000, 0), 1 / 30);
        lastFrame = now;
        if (!gesture || now - lastMove > 70) speed = 0;
        const q = gesture && !reduced() ? clamp(Math.abs(excess) / 80, 0, 1) : 0;
        const d = gesture && !reduced() ? clamp(speed / 60, -1, 1) : 0;
        const m = Math.max(Math.abs(d) * (1 - q), q);
        const bTarget = 4.5 * d * (1 - q);
        const oTarget = 9 * d * (1 - q) + 6 * Math.sign(excess) * q;
        const rTarget = visible && !options.disabled ? 1 : 0;
        const sTarget = (15 - 10 * m - 2 * q) * rTarget;
        const lTarget = 60 + 30 * m + 21 * q;
        if (reduced()) {
            if (!gesture) position = target;
            velocity = bVelocity = oVelocity = B = O = 0;
            R = rTarget; S = 15 * R; L = 60;
        } else {
            const h = dt / 4;
            for (let i = 0; i < 4; i++) {
                if (!gesture) { velocity += ((target - position) * 400 - velocity * 26) * h; position += velocity * h; }
                bVelocity += ((bTarget - B) * 680 - bVelocity * 34) * h; B += bVelocity * h;
                oVelocity += ((oTarget - O) * 680 - oVelocity * 34) * h; O += oVelocity * h;
            }
            const alpha = 1 - Math.exp(-32 * dt);
            S += (sTarget - S) * alpha; L += (lTarget - L) * alpha; R += (rTarget - R) * alpha;
        }
        render();
        const settled = (gesture || (Math.abs(target - position) < .01 && Math.abs(velocity) < .05))
            && Math.abs(B - bTarget) < .01 && Math.abs(bVelocity) < .03
            && Math.abs(O - oTarget) < .01 && Math.abs(oVelocity) < .03
            && Math.abs(S - (reduced() ? 15 * rTarget : sTarget)) < .01
            && Math.abs(L - (reduced() ? 60 : lTarget)) < .01 && Math.abs(R - rTarget) < .001;
        if (settled && (!gesture || speed === 0)) {
            if (!gesture) { position = target; velocity = B = O = bVelocity = oVelocity = 0; L = 60; }
            R = rTarget;
            if (!gesture || reduced()) S = 15 * R;
            render();
            lastFrame = 0;
        } else raf = win.requestAnimationFrame(tick);
    }
    function show() {
        win.clearTimeout(hideTimer); hideTimer = 0;
        visible = true; wake();
    }
    function hide() {
        win.clearTimeout(hideTimer); hideTimer = 0;
        if (gesture || focused || hovered) return;
        hideTimer = win.setTimeout(() => { hideTimer = 0; visible = false; wake(); }, 450);
    }
    function containsPoint(x, y) {
        const rect = grip.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }
    function move(event) {
        if (!gesture || event.pointerId !== gesture.id) return;
        event.preventDefault();
        const raw = localX(event.clientX) - gesture.offset;
        const elapsed = Math.max((event.timeStamp - gesture.time) / 1000, .008);
        speed = clamp((raw - gesture.raw) / elapsed, -2200, 2200);
        gesture.raw = raw; gesture.time = event.timeStamp;
        gesture.x = event.clientX; gesture.y = event.clientY;
        lastMove = win.performance.now();
        const [min, max] = bounds();
        target = clamp(raw, min, max);
        excess = raw - target;
        position = target + (reduced() ? 0 : rubber(excess));
        velocity = 0;
        render(); wake();
    }
    function finish(cancelled, event) {
        if (!gesture) return;
        const old = gesture;
        if (event && event.pointerId !== old.id) return;
        gesture = null;
        if (cancelled) { const [min, max] = bounds(); target = clamp(old.before, min, max); }
        speed = excess = velocity = 0;
        hovered = !options.disabled && old.type !== "touch" && containsPoint(event?.clientX ?? old.x, event?.clientY ?? old.y);
        if (grip.hasPointerCapture(old.id)) grip.releasePointerCapture(old.id);
        if (reduced()) position = target;
        announce(cancelled);
        render(); hide(); wake();
    }
    function down(event) {
        if (options.disabled || gesture || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        try { grip.setPointerCapture(event.pointerId); }
        catch { live.textContent = i18n.t("panelResize.captureFailed"); return; }
        // Re-grabbing a spring uses its visible position, never its old target.
        const edge = rawAtPosition();
        gesture = { id: event.pointerId, type: event.pointerType, before: target, offset: localX(event.clientX) - edge, raw: edge, time: event.timeStamp, x: event.clientX, y: event.clientY };
        speed = excess = velocity = 0;
        lastMove = -Infinity;
        show();
    }
    function key(event) {
        if (options.disabled || gesture) return;
        const [min, max] = bounds();
        const step = (event.shiftKey ? .06 : .02) * width;
        const next = event.key === "ArrowLeft" ? target - step : event.key === "ArrowRight" ? target + step
            : event.key === "Home" ? (rightPanel ? min : max) : event.key === "End" ? (rightPanel ? max : min)
            : event.key === "Escape" ? initialTarget() : null;
        if (next === null) return;
        event.preventDefault(); event.stopPropagation();
        target = clamp(next, min, max); velocity = speed = excess = 0;
        if (reduced()) position = target;
        show(); announce(); render(); wake();
    }
    function measure() {
        const rect = frame.getBoundingClientRect();
        if (rect.width <= 0) { suspended = true; stop(); return; }
        suspended = false;
        const oldScale = scale;
        scale = attachment ? rect.width / (frame.clientWidth || 1000) : Math.min(1, rect.width / 1000);
        const nextWidth = attachment ? (frame.clientWidth || 1000) : rect.width / scale;
        const geometryChanged = width !== nextWidth;
        const ratio = nextWidth / width;
        position *= ratio; target *= ratio; velocity *= ratio;
        if (gesture) gesture.before *= ratio;
        width = nextWidth;
        if (!attachment) {
            stage.style.width = `${width}px`;
            stage.style.transform = `scale(${scale})`;
            stage.style.height = `${rect.height / scale}px`;
        }
        const [min, max] = bounds();
        const clamped = clamp(target, min, max);
        position += clamped - target;
        target = clamped;
        if (gesture && (geometryChanged || oldScale !== scale)) {
            position = target + clamp(position - target, -15, 15);
            gesture.raw = rawAtPosition(); gesture.offset = localX(gesture.x) - gesture.raw; speed = 0;
        }
        render(); wake();
    }
    function update(patch = {}) {
        if (disposed) return;
        const oldWidth = options.width;
        options = { ...options, ...patch };
        if (!attachment) root.style.height = options.height == null ? "" : typeof options.height === "number" ? `${options.height}px` : options.height;
        grip.tabIndex = options.disabled ? -1 : 0;
        grip.toggleAttribute("data-disabled", !!options.disabled);
        grip.setAttribute("aria-disabled", String(!!options.disabled));
        if (options.disabled) {
            finish(true); hovered = focused = visible = false;
            win.clearTimeout(hideTimer); hideTimer = 0;
            if (doc.activeElement === grip) grip.blur();
        }
        if (attachment && !gesture && options.width !== oldWidth && Math.abs(options.width - nominalWidth()) > .01) {
            target = rightPanel ? width - options.width : options.width; position = target; velocity = 0;
        }
        measure();
    }
    on(grip, "pointerenter", (event) => { if (!options.disabled && event.pointerType !== "touch") { hovered = true; show(); } });
    on(grip, "pointerleave", () => { hovered = false; hide(); });
    on(grip, "pointerdown", down);
    on(win, "pointermove", move);
    on(win, "pointerup", (event) => finish(false, event));
    on(win, "pointercancel", (event) => finish(true, event));
    on(grip, "lostpointercapture", (event) => { if (gesture?.id === event.pointerId) finish(false); });
    on(grip, "focus", () => { focused = true; show(); });
    on(grip, "blur", () => { focused = false; hide(); });
    on(grip, "keydown", key);
    on(grip, "dblclick", (event) => { if (!options.disabled && !gesture) { event.preventDefault(); const [min, max] = bounds(); target = clamp(initialTarget(), min, max); velocity = speed = excess = 0; if (reduced()) position = target; announce(); render(); wake(); } });
    on(win, "keydown", (event) => { if (gesture && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(true); } });
    on(win, "blur", () => { finish(true); hovered = focused = false; hide(); });
    on(win, "focus", () => { focused = doc.activeElement === grip; if (focused && !options.disabled) show(); });
    on(win, "resize", measure);
    on(media, "change", () => { if (reduced()) { B = O = bVelocity = oVelocity = velocity = 0; position = target; } wake(); });
    on(doc, "visibilitychange", () => { if (doc.hidden) { finish(true); stop(); } else measure(); });
    const observer = new win.ResizeObserver(measure);
    observer.observe(frame);
    // Establish pixel widths before the first positive resize scales the normalized position.
    if (attachment) {
        width = frame.clientWidth || 1000;
        const initial = options.width ?? options.defaultWidth;
        target = rightPanel ? width - initial : initial;
        position = target;
    }
    update();
    return {
        update,
        destroy() {
            if (disposed) return;
            disposed = true;
            const id = gesture?.id;
            gesture = null;
            stop(); win.clearTimeout(hideTimer);
            listeners.forEach((off) => off());
            observer.disconnect();
            if (id != null && grip.hasPointerCapture(id)) grip.releasePointerCapture(id);
            if (attachment) panel.style.width = originalWidth;
            remove();
        },
    };
}
