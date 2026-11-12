import { gsap } from "gsap";

// Motion and Canvas algorithms preserved from the supplied Deep Agent EffortSlider.
function springEase(stiffness, damping, duration) {
  const decay = damping / 2;
  const frequency = Math.sqrt(stiffness - decay * decay);
  return (progress) => {
    if (progress === 0 || progress === 1) return progress;
    const time = progress * duration;
    return 1 - Math.exp(-decay * time) * (Math.cos(frequency * time) + decay / frequency * Math.sin(frequency * time));
  };
}
function createEffortField(canvas, getRatio) {
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let phase = 0;
  let lastTime = 0;
  const stars = Array.from({ length: 64 }, (_, i) => ({
    x: i * 0.61803398875 % 1,
    y: i * 0.754877666 % 1,
    size: 0.35 + i % 5 * 0.13,
    speed: 0.3 + i % 7 * 0.1
  }));
  const resize = () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const draw = (time = 0, still = false, motionBoost = 1) => {
    if (!ctx || width <= 0 || height <= 0) return;
    const ratio = getRatio();
    if (!still) phase += Math.min(Math.max(time - lastTime, 0), 0.05) * (0.16 + ratio * 0.85) * Math.max(1, motionBoost);
    lastTime = time;
    const hue = 210 + ratio * ratio * 63;
    const fill = 32 + (width - 32) * ratio;
    ctx.clearRect(0, 0, width, height);
    const base = ctx.createLinearGradient(0, 0, Math.max(fill, 32), 0);
    base.addColorStop(0, "#30343a");
    base.addColorStop(0.28, `hsl(${hue - 12} 38% 47%)`);
    base.addColorStop(0.65, `hsl(${hue} 79% 70%)`);
    base.addColorStop(1, `hsl(${hue + 5} 88% 70%)`);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let band = 0; band < 7; band++) {
      ctx.beginPath();
      for (let x = 0; x <= width + 4; x += 4) {
        const y = height * (0.12 + band * 0.15) + Math.sin(x * 0.034 + phase + band * 1.8) * 5 + Math.sin(x * 0.079 - phase * 0.6 + band) * 2 - x * 0.035;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 2 + band % 3 * 2;
      ctx.strokeStyle = `hsla(${hue + band * 2} 90% 87% / ${0.06 + ratio * 0.025})`;
      ctx.stroke();
    }
    const glowX = fill * (0.6 + Math.sin(phase * 0.7) * 0.12);
    const glow = ctx.createRadialGradient(glowX, height * 0.7, 0, glowX, height * 0.7, 46);
    glow.addColorStop(0, `hsla(${hue - 12} 100% 88% / .35)`);
    glow.addColorStop(1, `hsla(${hue} 100% 80% / 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    for (const [i, star] of stars.entries()) {
      const x = (star.x + phase * star.speed * 0.08) % 1 * width;
      const y = ((star.y - phase * star.speed * 0.04) % 1 + 1) % 1 * height;
      const fade = Math.min(1, x / 55);
      const twinkle = 0.45 + Math.sin(phase * 2 + i * 1.9) * 0.25;
      ctx.fillStyle = `rgba(255,255,255,${fade * twinkle * (0.4 + ratio * 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, star.size * (1 + ratio * 0.5), star.size * 0.65, -0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const shade = ctx.createLinearGradient(0, 0, Math.max(fill, 32), 0);
    shade.addColorStop(0, "rgba(36,39,44,.8)");
    shade.addColorStop(0.45, "rgba(36,39,44,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
  };
  const observer = new ResizeObserver(() => {
    resize();
    draw(lastTime, true);
  });
  observer.observe(canvas);
  resize();
  return { draw, dispose: () => observer.disconnect() };
}
var SPRING = [
  [0, 0],
  [0.02, 0.015],
  [0.04, 0.0532],
  [0.06, 0.1065],
  [0.08, 0.1686],
  [0.1, 0.2351],
  [0.13, 0.3363],
  [0.16, 0.4332],
  [0.2, 0.5495],
  [0.24, 0.648],
  [0.28, 0.7287],
  [0.33, 0.807],
  [0.38, 0.8646],
  [0.44, 0.9128],
  [0.5, 0.9447],
  [0.57, 0.968],
  [0.65, 0.9834],
  [0.74, 0.9924],
  [0.85, 0.9975],
  [1, 1]
];
function glideEase(progress) {
  const end = SPRING.findIndex(([x]) => x >= progress);
  if (end <= 0) return end === 0 ? 0 : 1;
  const [x0, y0] = SPRING[end - 1];
  const [x1, y1] = SPRING[end];
  return y0 + (y1 - y0) * (progress - x0) / (x1 - x0);
}
var returnEase = springEase(400, 23, 0.72);
export function createEffortMotion(root2, canvas, initialRatio, initialReducedMotion) {
  const state = { ratio: initialRatio, press: 1, body: 0, lean: 0, boost: 1 };
  let targetRatio = initialRatio;
  let reduced = initialReducedMotion;
  let attached = false;
  let disposed = false;
  let positionTween;
  let pressTween;
  let shapeTween;
  let boostTween;
  const field = createEffortField(canvas, () => state.ratio);
  const variables = () => ({
    "--effort-ratio": String(state.ratio),
    "--effort-press": String(state.press),
    "--effort-jelly-x": String(1 + state.body),
    "--effort-jelly-y": String(1 - state.body * 0.3),
    "--effort-jelly-offset": `${-state.lean * 9}px`,
    "--effort-jelly-skew": `${-state.lean * 12}deg`,
    "--effort-jelly-left": `${50 + state.lean * 32}%`,
    "--effort-jelly-right": `${50 - state.lean * 24}%`
  });
  const context = gsap.context(() => {
    gsap.set(root2, variables());
  }, root2);
  const paint = () => {
    if (disposed) return;
    for (const [name, value] of Object.entries(variables())) root2.style.setProperty(name, value);
    if (reduced) field.draw(gsap.ticker.time, true);
  };
  const draw = (time) => {
    if (!document.hidden) field.draw(time, false, state.boost);
  };
  const syncTicker = () => {
    if (attached) gsap.ticker.remove(draw);
    attached = !reduced;
    field.draw(gsap.ticker.time, true);
    if (attached) gsap.ticker.add(draw);
  };
  const stopTweens = () => {
    positionTween?.kill();
    pressTween?.kill();
    shapeTween?.kill();
    boostTween?.kill();
  };
  syncTicker();
  return {
    moveTo(ratio, immediate) {
      targetRatio = Math.max(0, Math.min(1, ratio));
      positionTween?.kill();
      positionTween = gsap.to(state, {
        ratio: targetRatio,
        duration: immediate || reduced ? 0 : 0.5,
        ease: glideEase,
        onUpdate: paint
      });
    },
    press() {
      pressTween?.kill();
      pressTween = gsap.to(state, { press: reduced ? 1 : 0.96, duration: reduced ? 0 : 0.08, onUpdate: paint });
    },
    drag(velocity) {
      if (reduced || disposed) return;
      const speed = Math.min(3.5, Math.abs(velocity));
      const deformation = Math.min(0.46, 0.045 + speed * 0.17);
      const lean = Math.sign(velocity) * deformation;
      shapeTween?.kill();
      shapeTween = gsap.timeline({ onUpdate: paint }).to(state, { body: deformation, lean, duration: 0.09, ease: "power2.out" }).to(state, { body: 0, lean: 0, duration: 0.72, ease: returnEase }, ">0.07");
      boostTween?.kill();
      boostTween = gsap.to(state, {
        boost: 1 + Math.min(2.2, 0.55 + speed * 0.6),
        duration: 0.12,
        ease: "power2.out"
      });
    },
    release() {
      pressTween?.kill();
      shapeTween?.kill();
      boostTween?.kill();
      pressTween = gsap.to(state, { press: 1, duration: reduced ? 0 : 0.32, ease: "power2.out", onUpdate: paint });
      shapeTween = gsap.to(state, {
        body: 0,
        lean: 0,
        duration: reduced ? 0 : 0.72,
        ease: returnEase,
        onUpdate: paint
      });
      boostTween = gsap.to(state, { boost: 1, duration: reduced ? 0 : 0.7, ease: "power2.out" });
    },
    setReducedMotion(next) {
      if (next === reduced) return;
      reduced = next;
      stopTweens();
      Object.assign(state, { ratio: targetRatio, press: 1, body: 0, lean: 0, boost: 1 });
      paint();
      syncTicker();
    },
    dispose() {
      disposed = true;
      stopTweens();
      gsap.ticker.remove(draw);
      field.dispose();
      context.revert();
    }
  };
}
