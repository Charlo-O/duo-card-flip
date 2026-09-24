import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import * as THREE from "three";
import gsap from "gsap";
import { makeCard, PERSPECTIVE } from "./card.js";
import {
  CARD_W,
  makeCoverTexture,
  makeInsideLeftTexture,
  makeInsideRightTexture,
  loadFonts,
  loadImage,
} from "./textures.js";

// Canvas that hosts the card, centered on the card slot. Big enough for the
// open card plus the perspective overshoot of the lifted panel.
const VIEW_W = 720;
const VIEW_H = 520;
// Horizontal drag distance for a full 0 → 1 flip (1.5 panel widths).
const DRAG_RANGE = CARD_W * 1.5;
const DRAG_SLOP = 3;

const slot = document.getElementById("card");
const hit = document.getElementById("hit");
const slider = document.getElementById("slider");
const sliderWrap = document.getElementById("slider-wrap");
const pValue = document.getElementById("p-value");
const thetaValue = document.getElementById("theta-value");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
renderer.setClearColor(0x000000, 0);
renderer.domElement.className = "stage";
slot.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  (2 * Math.atan(VIEW_H / 2 / PERSPECTIVE) * 180) / Math.PI,
  VIEW_W / VIEW_H,
  10,
  PERSPECTIVE * 4,
);
camera.position.set(0, 0, PERSPECTIVE);
camera.lookAt(0, 0, 0);

const state = { p: 0 };
let card = null;
let tween = null;
let drawnP = -1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  renderer.setPixelRatio(dpr);
  renderer.setSize(VIEW_W, VIEW_H);
  card?.setViewport(VIEW_W, VIEW_H, dpr);
  drawnP = -1;
}

// --------------------------------------------------------------- easing
// cubic-bezier(x1, y1, x2, y2) as a GSAP-compatible ease function.
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      const d = dx(t);
      if (Math.abs(e) < 1e-6) return sy(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    while (hi - lo > 1e-6) {
      if (sx(t) < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

// Curves fitted to the reference recording.
const OPEN = { ease: bezier(0.3, 0.9, 0.5, 1), duration: 0.63 };
const CLOSE = { ease: bezier(0.2, 0, 0.2, 1), duration: 0.59 };
const SNAP_EASE = bezier(0, 0, 0.58, 1);

function animateTo(target, { ease, duration }) {
  tween?.kill();
  tween = gsap.to(state, {
    p: target,
    duration,
    ease,
    onComplete: () => { tween = null; },
  });
}

function toggle() {
  const heading = tween ? tween.vars.p : Math.round(state.p);
  if (heading >= 0.5) animateTo(0, CLOSE);
  else animateTo(1, OPEN);
}

function snap(velocity) {
  let target = state.p >= 0.5 ? 1 : 0;
  if (Math.abs(velocity) > 1.2) target = velocity > 0 ? 1 : 0;
  const dist = Math.abs(target - state.p);
  if (dist < 1e-4) { state.p = target; return; }
  const duration = Math.min(0.65, Math.max(0.08, 0.325 * Math.sqrt(dist / 0.125)));
  animateTo(target, { ease: SNAP_EASE, duration });
}

// --------------------------------------------------------------- input
let pointer = null;

hit.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  hit.setPointerCapture(e.pointerId);
  tween?.kill();
  tween = null;
  pointer = { id: e.pointerId, x0: e.clientX, p0: state.p, dragging: false, samples: [] };
});

hit.addEventListener("pointermove", (e) => {
  if (!pointer || e.pointerId !== pointer.id) return;
  const dx = e.clientX - pointer.x0;
  if (!pointer.dragging && Math.abs(dx) > DRAG_SLOP) {
    pointer.dragging = true;
    hit.classList.add("dragging");
  }
  if (!pointer.dragging) return;
  state.p = Math.min(1, Math.max(0, pointer.p0 - dx / DRAG_RANGE));
  const now = performance.now();
  pointer.samples.push([now, state.p]);
  while (pointer.samples.length > 2 && now - pointer.samples[0][0] > 90) pointer.samples.shift();
});

function release(e) {
  if (!pointer || e.pointerId !== pointer.id) return;
  const { dragging, samples } = pointer;
  pointer = null;
  hit.classList.remove("dragging");
  if (!dragging) {
    if (e.type === "pointerup") toggle();
    else if (tween === null) snap(0);
    return;
  }
  let v = 0;
  if (samples.length > 1) {
    const [t0, p0] = samples[0];
    const [t1, p1] = samples[samples.length - 1];
    if (t1 > t0) v = ((p1 - p0) / (t1 - t0)) * 1000;
  }
  snap(v);
}
hit.addEventListener("pointerup", release);
hit.addEventListener("pointercancel", release);

hit.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggle();
  }
});

slider.addEventListener("input", () => {
  tween?.kill();
  tween = null;
  state.p = slider.value / 1000;
});

window.addEventListener("keydown", (e) => {
  if (e.target === slider || e.target === hit) return;
  if (e.key === "ArrowRight") animateTo(1, OPEN);
  if (e.key === "ArrowLeft") animateTo(0, CLOSE);
});

window.addEventListener("resize", resize);

// --------------------------------------------------------------- frame
function syncUi(p) {
  const pct = ((8 + p * (CARD_W - 16)) / CARD_W) * 100;
  if (document.activeElement !== slider || pointer) slider.value = Math.round(p * 1000);
  sliderWrap.style.setProperty("--fill", `${pct}%`);
  pValue.textContent = p.toFixed(2);
  thetaValue.textContent = String(Math.round(p * 180));
  hit.setAttribute("aria-label", p >= 0.5 ? "Close card" : "Open card");

  // Hit area follows the visible card: hinge .. right edge of the base page.
  const hingeX = (p * CARD_W) / 2;
  const left = Math.min(hingeX, hingeX + CARD_W * Math.cos(p * Math.PI));
  const right = hingeX + CARD_W;
  hit.style.clipPath = `inset(0 ${CARD_W * 1.5 - right}px 0 ${left + CARD_W / 2}px)`;
}

function tick() {
  if (card && state.p !== drawnP) {
    card.apply(state.p);
    syncUi(state.p);
    renderer.render(scene, camera);
    drawnP = state.p;
  }
}

async function init() {
  await loadFonts();
  const avatar = await loadImage("/avatar@2x.png");
  card = makeCard({
    cover: makeCoverTexture(),
    insideLeft: makeInsideLeftTexture(avatar),
    insideRight: makeInsideRightTexture(),
  });
  scene.add(card.group);

  const params = new URLSearchParams(location.search);
  if (params.has("p")) state.p = Math.min(1, Math.max(0, parseFloat(params.get("p")) || 0));
  resize();
  renderer.setAnimationLoop(tick);
  document.documentElement.dataset.ready = "1";
}

init();
