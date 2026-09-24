# Business Card — open/close interaction

A WebGL replica of Chánh Đại (@ncdai)'s folded business-card interaction:
the card opens 0–180° around its center hinge like a foldable phone display.
Each half stays rigid and flat while the glass darkens at grazing angles and
the texture blurs while in motion. Fully open, the two halves form one
seamless landscape card.

## Run

```bash
npm install
npm run dev
```

## Controls

- Drag horizontally on the card, or use the slider — both drive `progress ∈ [0,1]` → θ ∈ [0°,180°].
- Release snaps to open/closed (velocity-aware, GSAP expo.out).
- Arrow keys flip open/closed.
- `?p=0.5` URL param pins a static progress for debugging; `&blur=0.8` forces
  the motion-blur look on a static frame.

## Structure

- `src/card.js` — meshes + shaders. The flipping half is a rigid PlaneGeometry
  rotated around the hinge; it has no page curl or per-vertex bend. The
  fragment shader picks front/back texture via `gl_FrontFacing`, applies
  foldable-display glass shading at grazing angles, velocity-driven texture
  blur (`uBlur`), and a rounded-rect mask with a small hinge overlap.
- `src/textures.js` — canvas-drawn card faces (logo/avatar cropped from the
  reference video in `public/`); spine edges carry no border stroke.
- `src/main.js` — scene, camera, drag + slider input, GSAP snap, and the
  flip-velocity → `uBlur` coupling.
