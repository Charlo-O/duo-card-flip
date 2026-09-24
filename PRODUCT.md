# PRODUCT.md

## Product Purpose
A 1:1 interactive replication of Chánh Đại (@ncda1)'s "Business Card" open/close interaction (reference: bundled mp4). A folded business card rendered in WebGL that opens 0–180° around a hinge like a foldable phone display. Each half stays rigid and flat while the screen shading changes with the viewing angle.

## Register
brand

## Users
Visitors of a portfolio/demo piece. Interaction is the product: drag the card edge or the slider to flip it.

## Stack (user-confirmed)
- Vite + vanilla Three.js, custom ShaderMaterial (hinged rigid-panel rotation, `gl_FrontFacing` dual textures)
- GSAP for release snap/easing
- Logo + avatar textures cropped from the 4K reference video frames

## Interaction spec (from reference video)
- Slider and horizontal drag both drive `progress ∈ [0,1]` → θ ∈ [0°,180°]
- On release: snap to 0 or 1 with GSAP ease (threshold ≈ 0.5)
- Readout: `p 0.00 / θ 0°` in mono font; caption "Drag the card or the slider."
- Card: white, rounded corners, thin dark border. Cover: logo top-left, `@ncda1` top-right, "Chánh Đại / Design Engineer" bottom-left. Open inside-left: avatar, "Creating with code. Small details matter.", "he/him". Inside-right: logo near spine, `@ncda1` top-right, link list (Web/GitHub/X/LinkedIn), name bottom-right.
