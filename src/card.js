import * as THREE from "three";
import { CARD_W, CARD_H, TEX_SCALE } from "./textures.js";

// World units are CSS px. The card center sits at the origin and the camera
// looks at it from PERSPECTIVE px away (fitted to the reference: 1250px).
export const PERSPECTIVE = 1250;
const RADIUS = 12;
const BORDER = 2;

// ---------------------------------------------------------------------------
// Flipping page. Its silhouette is a true perspective projection of a rigid
// panel rotating about the hinge, filled black. The face content is NOT
// projected: it stays anchored to the hinge in screen space at full height and
// is only revealed where the silhouette overlaps the card's rectangle, the way
// the reference behaves. It is stretched horizontally only when the silhouette
// grows wider than the card. Above and below the card the panel stays black.
// ---------------------------------------------------------------------------
const pageVert = /* glsl */ `
  uniform float uTheta;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    float c = cos(uTheta), s = sin(uTheta);
    vec3 p = vec3(position.x * c, position.y, position.x * s);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const pageFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uFront;
  uniform sampler2D uBack;
  uniform vec2 uCard;       // card size, CSS px
  uniform vec2 uViewport;   // canvas size, CSS px
  uniform float uDpr;
  uniform float uHinge;     // hinge x, CSS px from card center
  uniform float uStretch;   // horizontal content scale about the hinge (>= 1)
  uniform float uWidth;     // projected hinge-to-outer-edge distance, CSS px
  uniform float uIsBack;    // 0: cover side, 1: inside-left side
  uniform float uLight;     // brightness at the hinge
  uniform float uShade;     // extra darkening reached at the outer edge
  uniform float uBlur[9];   // blur sigma (CSS px) at u = 0, .3, .4 … .9, 1
  uniform float uEdgeV[7];  // top/bottom edge shadow strength at u = .1 … .95
  uniform float uEdgeL[7];  // and its falloff length, CSS px
  uniform float uSeam;      // hairline at the hinge while the back is showing
  uniform float uLod0;      // mip level that maps one texel row to a device px
  uniform float uTexScale;  // texels per CSS px
  varying vec2 vLocal;

  // c: content coords in CSS px from the face's top-left corner. Taps are kept
  // inside the border (shrunk by the mip footprint) so the blur never smears
  // the black frame into the paper; edge darkening is modelled separately.
  vec3 content(vec2 c, float lod) {
    float inset = ${BORDER.toFixed(1)} + 0.5 + 0.5 * exp2(lod) / uTexScale;
    c = clamp(c, vec2(inset), uCard - inset);
    vec2 uv = vec2(c.x, uCard.y - c.y) / uCard;
    return uIsBack > 0.5 ? textureLod(uBack, uv, lod).rgb : textureLod(uFront, uv, lod).rgb;
  }

  // Horizontal darkening toward the outer edge. It lives underneath the blur
  // (so it flattens where the blur is wide), mirrored at the panel's edges.
  float shadeAt(float cx) {
    float s = (uIsBack > 0.5 ? uCard.x - cx : cx) * uStretch / uWidth;
    s = 1.0 - abs(1.0 - abs(s));
    return 1.0 - uShade * smoothstep(0.03, 1.28, s);
  }

  float edgeAt(float v[7], float u) {
    const float K[7] = float[7](0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 0.95);
    if (u <= K[0]) return v[0];
    for (int i = 1; i < 7; i++) {
      if (u <= K[i]) return mix(v[i - 1], v[i], (u - K[i - 1]) / (K[i] - K[i - 1]));
    }
    return v[6];
  }

  // Signed distance to the face outline in content space (y down). The spine
  // side of the inside-left face has no border, so its box runs past it.
  float sdFace(vec2 c) {
    bool back = uIsBack > 0.5;
    vec2 lo = vec2(0.0);
    vec2 hi = vec2(back ? uCard.x + 8.0 : uCard.x, uCard.y);
    vec2 p = c - (lo + hi) * 0.5;
    vec2 b = (hi - lo) * 0.5;
    float r = (back ? p.x < 0.0 : p.x > 0.0) ? ${RADIUS.toFixed(1)} : 0.0;
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  float blurAt(float u) {
    if (u <= 0.3) return mix(uBlur[0], uBlur[1], u / 0.3);
    float k = (u - 0.3) * 10.0;
    int i = int(min(floor(k), 6.0));
    return mix(uBlur[i + 1], uBlur[i + 2], k - float(i));
  }

  float sdOuterRound(vec2 p, vec2 b, float r) {
    r = p.x > 0.0 ? r : 0.0;
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  void main() {
    // The box runs a little past the hinge so that edge is left to MSAA and
    // meets the base page without a light seam.
    float sd = sdOuterRound(vLocal - vec2(uCard.x * 0.5 - 2.0, 0.0), vec2(uCard.x * 0.5 + 2.0, uCard.y * 0.5), ${RADIUS.toFixed(1)});
    float coverage = clamp(0.5 - sd / max(fwidth(sd), 1e-4), 0.0, 1.0);
    if (coverage <= 0.0) discard;

    // screen position on the card plane, CSS px, origin = card center, y up
    vec2 S = gl_FragCoord.xy / uDpr - uViewport * 0.5;
    float dx = (S.x - uHinge) / uStretch;
    vec2 c = vec2(uIsBack > 0.5 ? uCard.x + dx : dx, uCard.y * 0.5 - S.y);

    float u = clamp(vLocal.x / uCard.x, 0.0, 1.0);
    vec3 col = vec3(0.0);
    // The blurred paper is clipped crisply inside the card border; the border
    // and the panel above and below the card stay solid black.
    float sdc = sdFace(c);
    float paper = 1.0 - smoothstep(-0.5, 0.5, (sdc + ${BORDER.toFixed(1)}) / max(fwidth(sdc), 1e-4));
    if (paper > 0.0) {
      float sigma = blurAt(u);
      if (sigma < 0.3) {
        col = content(c, uLod0) * shadeAt(c.x);
      } else {
        float lod = max(uLod0, log2(sigma * uTexScale * 0.8));
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 32; i++) {
          float fi = float(i) + 0.5;
          float r = sqrt(fi / 32.0) * 2.4 * sigma;
          float a = fi * 2.39996323;
          float w = exp(-0.5 * r * r / (sigma * sigma));
          vec2 tap = c + r * vec2(cos(a), sin(a));
          acc += content(tap, lod) * shadeAt(tap.x) * w;
          wsum += w;
        }
        col = acc / wsum;
      }
      // soft shadow cast inward from the top and bottom border
      float d = min(c.y, uCard.y - c.y) - ${BORDER.toFixed(1)};
      float L = max(edgeAt(uEdgeL, u), 0.3);
      col *= 1.0 - edgeAt(uEdgeV, u) * exp(-max(d, 0.0) / L);
      col *= paper;
    }

    col *= uLight;
    float d = abs(S.x - uHinge) * uDpr;
    col *= 1.0 - uSeam * clamp(1.0 - d, 0.0, 1.0);
    gl_FragColor = vec4(col * coverage, coverage);
  }
`;

const baseVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const baseFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uLight;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    gl_FragColor = vec4(t.rgb * uLight, t.a);
  }
`;

function faceTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.premultiplyAlpha = true;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function makeCard({ cover, insideLeft, insideRight }) {
  const group = new THREE.Group();

  const pageGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
  pageGeo.translate(CARD_W / 2, 0, 0);
  const pageMat = new THREE.ShaderMaterial({
    vertexShader: pageVert,
    fragmentShader: pageFrag,
    side: THREE.DoubleSide,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTheta: { value: 0 },
      uFront: { value: faceTexture(cover) },
      uBack: { value: faceTexture(insideLeft) },
      uCard: { value: new THREE.Vector2(CARD_W, CARD_H) },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uHinge: { value: 0 },
      uStretch: { value: 1 },
      uWidth: { value: CARD_W },
      uIsBack: { value: 0 },
      uLight: { value: 1 },
      uShade: { value: 0 },
      uBlur: { value: new Array(9).fill(0) },
      uEdgeV: { value: new Array(7).fill(0) },
      uEdgeL: { value: new Array(7).fill(1) },
      uSeam: { value: 0 },
      uLod0: { value: 0 },
      uTexScale: { value: TEX_SCALE },
    },
  });
  const page = new THREE.Mesh(pageGeo, pageMat);
  page.renderOrder = 2;
  page.frustumCulled = false;
  group.add(page);

  const baseGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
  baseGeo.translate(CARD_W / 2, 0, 0);
  const baseMat = new THREE.ShaderMaterial({
    vertexShader: baseVert,
    fragmentShader: baseFrag,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uMap: { value: faceTexture(insideRight) },
      uLight: { value: 1 },
    },
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.renderOrder = 1;
  group.add(base);

  function setViewport(width, height, dpr) {
    pageMat.uniforms.uViewport.value.set(width, height);
    pageMat.uniforms.uDpr.value = dpr;
    pageMat.uniforms.uLod0.value = Math.max(0, Math.log2(TEX_SCALE / dpr));
  }

  function apply(p) {
    const f = frame(p);
    group.position.x = f.hinge;
    const u = pageMat.uniforms;
    u.uTheta.value = f.theta;
    u.uHinge.value = f.hinge;
    u.uStretch.value = f.stretch;
    u.uWidth.value = Math.max(f.width, 0.5);
    u.uIsBack.value = f.back ? 1 : 0;
    u.uLight.value = f.pageLight;
    u.uShade.value = f.shade;
    for (let i = 0; i < 9; i++) u.uBlur.value[i] = f.blur[i];
    for (let i = 0; i < 7; i++) {
      u.uEdgeV.value[i] = f.edgeV[i];
      u.uEdgeL.value[i] = f.edgeL[i];
    }
    // A hairline of the black panel shows at the hinge once the stretched
    // inside-left face overhangs the card (p ≳ 0.87), fading out at p = 1.
    u.uSeam.value = f.back && p < 1 ? 0.34 * Math.min(1, (f.stretch - 1) / 0.02) : 0;
    baseMat.uniforms.uLight.value = f.baseLight;
    return f;
  }

  return { group, apply, setViewport };
}

// ---------------------------------------------------------------------------
// Everything below is a function of progress only (no velocity terms): the
// reference renders identical frames for the same p whether it is being
// dragged slowly or animated by a click. Tables were measured frame by frame.
// ---------------------------------------------------------------------------

// Darkening at the outer edge relative to the hinge, cover side (by θ°).
const FRONT_SHADE = [
  [0, 0], [7, 0.114], [10.5, 0.155], [15.4, 0.192], [20, 0.227], [24, 0.271],
  [29, 0.311], [32.6, 0.334], [36.4, 0.354], [40.5, 0.364], [44, 0.373],
  [47, 0.372], [51, 0.368], [55.5, 0.333], [63.4, 0.26], [69.8, 0.184],
  [79.1, 0.056], [90, 0],
];
// Same for the inside-left side, indexed by φ = 180° − θ.
const BACK_SHADE = [
  [0, 0], [4.5, 0.067], [6.4, 0.092], [9.4, 0.133], [12, 0.164], [15, 0.198],
  [20.2, 0.269], [25.1, 0.335], [30.7, 0.392], [37.9, 0.464], [45, 0.509],
  [50.3, 0.513], [55.5, 0.482], [61.9, 0.428], [67.1, 0.353], [73.1, 0.253],
  [79.5, 0.145], [85.1, 0.046], [90, 0],
];
// Blur sigma (CSS px) across the panel, sampled at u = 0, .3, .4 … .9, 1
// (u = 0 at the hinge, 1 at the outer edge), one row per angle.
const FRONT_BLUR = [
  [0, [0, 0, 0, 0, 0, 0, 0, 0, 0]],
  [18, [0, 0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8]],
  [36, [0, 0, 0, 0.2, 0.4, 0.6, 1, 2, 3.5]],
  [45, [0, 0, 0.2, 0.4, 0.8, 1.4, 2.5, 5, 8]],
  [54, [0, 0, 0.2, 0.5, 1, 2.4, 3.6, 9, 14]],
  [63, [0, 0, 0.2, 0.5, 1, 1.8, 3, 3.5, 5]],
  [72, [0, 0, 0, 0.3, 0.5, 0.7, 1, 1.5, 2.5]],
  [81, [0, 0, 0, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2]],
  [90, [0, 0, 0, 0, 0, 0, 0, 0, 0]],
];
const BACK_BLUR = [
  [0, [0, 0, 0, 0, 0, 0, 0, 0, 0]],
  [2, [0, 0, 0, 0, 0, 0, 0, 0, 0]],
  [7, [0, 0, 0.2, 0.3, 0.3, 0.4, 0.5, 0.6, 0.7]],
  [9.4, [0, 0.2, 0.3, 0.3, 0.4, 0.7, 0.9, 1.2, 1.4]],
  [15, [0, 0.5, 0.8, 1, 1.2, 1.6, 1.8, 2, 2.2]],
  [21.7, [0, 1, 1.4, 1.8, 2, 2.8, 3.8, 4.8, 5.5]],
  [27, [0, 1.4, 1.8, 2.2, 2.8, 5.2, 7.2, 8, 8.5]],
  [36, [0, 1.4, 2, 4.2, 6.5, 7.8, 10, 14, 17]],
  [45, [0, 2.5, 4.5, 6.5, 7.8, 10, 13, 16, 18]],
  [63, [0, 4, 6, 8, 10, 13, 16, 19, 21]],
  [90, [0, 5, 7, 9, 11, 14, 17, 20, 22]],
];

// Shadow cast inward from the top and bottom border: strength V and falloff
// length L (CSS px) of V·exp(−d/L), sampled at u = .1, .2, .35, .5, .7, .85, .95.
const FRONT_EDGE = [
  [0, [0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1]],
  [9, [0, 0, 0, 0, 0.01, 0.02, 0.02], [1, 1, 1, 1, 1, 1, 1]],
  [18, [0, 0, 0, 0.02, 0.07, 0.16, 0.23], [1, 1, 1, 1, 1, 2.9, 3.1]],
  [29, [0, 0, 0.01, 0.09, 0.3, 0.46, 0.52], [1, 1, 1, 1.6, 3.1, 3.3, 4.2]],
  [36, [0, 0, 0.02, 0.18, 0.43, 0.52, 0.55], [1, 1, 1, 3.1, 3.3, 5.8, 10.1]],
  [45, [0, 0, 0.02, 0.24, 0.49, 0.54, 0.59], [1, 1, 1, 3.1, 3.3, 8.9, 13.8]],
  [54, [0, 0, 0.02, 0.23, 0.5, 0.55, 0.61], [1, 1, 1, 2.9, 3.3, 8.9, 13.8]],
  [63, [0, 0, 0.02, 0.16, 0.39, 0.53, 0.54], [1, 1, 1, 2.4, 3.5, 4.5, 8.9]],
  [72, [0, 0, 0, 0.03, 0.17, 0.3, 0.39], [1, 1, 1, 1, 2.6, 3.1, 3.5]],
  [90, [0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1]],
];
const BACK_EDGE = [
  [0, [0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1]],
  [6.8, [0.05, 0.06, 0.08, 0.1, 0.06, 0.09, 0.18], [1, 1.2, 1.4, 1, 1, 1, 1.3]],
  [9.4, [0.05, 0.07, 0.11, 0.14, 0.1, 0.1, 0.25], [1.1, 1.2, 1.2, 1.3, 1, 1, 1.3]],
  [15, [0.07, 0.11, 0.17, 0.21, 0.28, 0.33, 0.37], [1, 1.2, 1.3, 1.5, 1.4, 2.6, 3.8]],
  [17.6, [0.1, 0.13, 0.2, 0.24, 0.33, 0.39, 0.44], [1.3, 1.2, 1.4, 1.2, 2.6, 4.8, 5.8]],
  [21.7, [0.11, 0.16, 0.23, 0.3, 0.4, 0.5, 0.58], [1.2, 1.2, 1.2, 1.7, 5.1, 7.9, 7.9]],
  [27, [0.14, 0.2, 0.3, 0.37, 0.53, 0.63, 0.63], [1.3, 1.4, 1.3, 4, 7.4, 10.1, 14.7]],
  [36, [0.18, 0.24, 0.36, 0.5, 0.63, 0.62, 0.68], [1.4, 1.3, 3.3, 6.6, 13, 42, 42]],
  [45, [0.2, 0.28, 0.42, 0.6, 0.63, 0.7, 0.69], [1.3, 1.4, 5.4, 7.9, 25.6, 50.6, 50.6]],
  [54, [0.22, 0.31, 0.45, 0.63, 0.64, 0.7, 0.68], [1.2, 1.8, 5.8, 8.4, 29, 50.6, 50.6]],
  [63, [0.23, 0.33, 0.45, 0.62, 0.64, 0.69, 0.7], [1.3, 2.1, 6.2, 8.4, 24.1, 39.5, 44.7]],
  [72, [0.24, 0.32, 0.41, 0.55, 0.62, 0.65, 0.69], [1.2, 1.8, 5.8, 7.4, 16.6, 30.8, 39.5]],
  [81, [0.25, 0.3, 0.34, 0.42, 0.54, 0.62, 0.62], [1.3, 1.5, 2.9, 5.4, 7.4, 8.4, 13]],
  [90, [0.25, 0.3, 0.34, 0.42, 0.54, 0.62, 0.62], [1.3, 1.5, 2.9, 5.4, 7.4, 8.4, 13]],
];

function rows(t, x, col = 1) {
  if (x <= t[0][0]) return t[0][col];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const x0 = t[i - 1][0], a = t[i - 1][col];
      const x1 = t[i][0], b = t[i][col];
      const k = (x - x0) / (x1 - x0);
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return t[t.length - 1][col];
}

function table(t, x) {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) {
      const [x0, y0] = t[i - 1];
      const [x1, y1] = t[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return t[t.length - 1][1];
}

export function frame(p) {
  const theta = p * Math.PI;
  const deg = p * 180;
  const back = deg > 90;
  // The hinge slides right by half a panel as the card opens, so the closed
  // card and the open card share the same center.
  const hinge = -CARD_W / 2 + (p * CARD_W) / 2;
  // Uniform dimming of the right half, and of the inside-left at its hinge.
  const baseLight = 1 - Math.min(0.784, 1.2 * Math.pow(1 - p, 0.93));
  const phi = 180 - deg;
  // Projected distance from the hinge to the panel's outer edge. The face is
  // stretched to it when perspective makes the panel wider than the card.
  const z = CARD_W * Math.sin(theta);
  const edge = ((hinge + CARD_W * Math.cos(theta)) * PERSPECTIVE) / (PERSPECTIVE - z);
  const stretch = Math.max(1, Math.abs(edge - hinge) / CARD_W);
  return {
    theta,
    hinge,
    stretch,
    back,
    baseLight,
    pageLight: back ? baseLight : 1,
    shade: back ? table(BACK_SHADE, phi) : table(FRONT_SHADE, deg),
    blur: back ? rows(BACK_BLUR, phi) : rows(FRONT_BLUR, deg),
    edgeV: back ? rows(BACK_EDGE, phi, 1) : rows(FRONT_EDGE, deg, 1),
    edgeL: back ? rows(BACK_EDGE, phi, 2) : rows(FRONT_EDGE, deg, 2),
  };
}
