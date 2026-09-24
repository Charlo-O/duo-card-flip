# DESIGN.md

## Color
- Paper white: `#fafafa`–`#ffffff` card on near-white page `#f7f7f5`
- Ink: near-black `#111`–`#1a1a1a` (borders, primary text, slider fill)
- Muted gray text: `#8a8a8a` (`@ncda1`, "Design Engineer", "he/him", link labels)
- Strategy: Restrained, monochrome foldable-display aesthetic

## Typography
- UI/card sans: grotesk (Inter / Helvetica Neue / system), medium-bold for name, regular gray for meta
- Readout: monospace (`ui-monospace`, SFMono, Geist Mono), small, gray

## Card geometry
- Panel ratio ≈ 0.68 (portrait, e.g. 150×220). Open card = two rigid display halves side by side, hinge at center, with a very subtle crease
- Border ≈ 2–3px, corner radius ≈ 14px; spine-adjacent corners square (inside faces)

## Motion
- θ = π·progress. One flat display half rotates around the hinge from 0° to 180°
- Lighting: soft key light front-left; glass darkens at grazing angles; hinge shading adds depth; soft blob shadow on ground + analytic shadow on the underlying panel
- Release easing: exponential out, no bounce
