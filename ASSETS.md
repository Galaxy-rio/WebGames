# Asset provenance

- Archived initial artwork (no longer used by the game library): `public/images/chroma-hero.webp` and `chroma-cover.webp`, original generated artwork for this project, created with OpenAI ImageGen on 2026-09-10. One landscape generation, reused for background and cover. Optimized as WebP.
- Brief: an iridescent folded glass loop with coral, emerald and cobalt spectral light, on a midnight navy studio background; subject on right, quiet title area on left; no text or logos.
- The visual composition takes inspiration from console game hubs. No PlayStation logos, commercial game covers, RGB Rush artwork or sounds are included.
- Interface icons: simple project-authored SVG geometry.
- Sounds: synthesized with browser Web Audio API.
- Fonts: system fonts; no external font requests.

## Chroma Dash wordmark

- File: `public/images/chroma-dash-logo.webp`.
- Created on 2026-09-10 with the built-in OpenAI ImageGen tool (one generation, no CLI).
- Original uppercase hand-drawn pastel lettering, warm brown outline and off-white sticker rim, with genuine transparency.
- Web asset: 1070 × 195, transparent lossless WebP. Only excess transparent margins were cropped and the output downscaled for the page header.
- Placement: absolutely positioned inside the existing page toolbar; it adds no layout height to the game shell.

Exact generation prompt:

```text
Use case: logo-brand.
Asset type: original transparent PNG wordmark for a cute hand-drawn color-matching browser game.
Primary request: Generate exactly one compact horizontal single-line logo reading "CHROMA DASH".
Scene/backdrop: genuinely transparent alpha background, no background color, no checkerboard pattern.
Subject and style: very legible, bouncy chunky rounded UPPERCASE lettering, subtly irregular hand-inked warm dark brown #514b40 outline. Charming cozy casual game lettering with simple flat pastel fills. Muted coral #e9a088, sage/mint #a8c990, powder blue #97bfd0 and butter yellow distributed harmoniously across the letters. A restrained off-white sticker rim and a small down-right warm shadow belong to the lettering silhouette.
Composition/framing: One single horizontal line, never stacked. Approximate wordmark silhouette proportion 4.5:1. Center the lettering, occupy most of the width with a tight transparent safe margin. Preserve clearly readable space between CHROMA and DASH. Designed to display at only 260–340px wide and 60–76px high above a pastel mint toy-console game on a cream diagonal-stripe background; do NOT include that console or that backdrop in this asset. Prioritize small-size readability and compact silhouette.
Text (verbatim): "CHROMA DASH". Spell exactly C H R O M A, space, D A S H. All ten letters uppercase. No other text or symbols.
Constraints: original lettering design, one logo only, actual transparent alpha, friendly hand-drawn look, clean edges, consistent outline weight, letter counters remain open and readable.
Avoid: glossy finish, 3D extrusion, corporate or professional tool branding, extra words, Chinese text, trademark glyphs, characters, objects, multiple variants, presentation sheets, mockups, background texture, fake transparency grid.
```

## Website mark

- `public/images/galaxyrio-logo.svg`: reuses the exact project-authored g path, mint dot and rounded navy tile from `public/favicon.svg`, saved as a scalable website logo asset.
- The library header uses this asset beside the aligned galaxyrio / PLAY wordmark. Chroma Dash's existing transparent wordmark is also reused in the game hub and game tile.

## Pastel painting background and cover

- Active background: `public/images/chroma-pastel-background.webp`, 1672 × 941.
- Active cover: `public/images/chroma-pastel-cover.webp`, 512 × 512, cropped from the same illustration.
- Generated with the built-in OpenAI ImageGen tool on 2026-09-10, one generation, no CLI. Inspired by the user's supplied references for painting supplies and cute hand-drawn style.
- Warm cream field, flat muted pastel supplies and a smiling color-card mascot. No glass ring, commercial game art, text or interface baked into the artwork.
- Stored as optimized WebP assets. The game metadata selects the artwork and a light hub theme; other games can independently select their own theme.
- Background fallback color `#f5ead5` is sampled from the generated cream field.

Exact generation prompt:

```text
Use case: illustration-story.
Asset type: original landscape 16:9 homepage background illustration for a cheerful indie color-matching game, Chroma Dash. Generate exactly one new image, ideally 2560 x 1440 pixels. This is artwork only, with no words or interface.

Scene/backdrop: a perfectly clean solid flat pale oatmeal cream background, approximately #F5ECD9, covering at least 65% of the entire canvas. No stripes, patterns, grain, paper texture, horizon, room, or table edge. This warm cream field is the large quiet foundation of the composition.

Composition: keep the entire LEFT 55% almost completely empty cream for a large game title and description to be added separately. Keep the upper 18% quiet blank cream for a header and thumbnail navigation, and bottom 15% quiet cream for footer content. All illustration objects form one readable friendly cluster fully inside the RIGHT half, approximately x=65–91% and y=28–78%, with ample breathing room and a strong silhouette suitable for a square crop focused on the character.

Subject: a cute rounded off-white color-swatch card mascot, slightly imperfect like a hand-cut square of thick paper, with two tiny dark brown dot eyes, a tiny curved smile, rosy pink cheeks, and very simple little arms. It holds one tall paintbrush with a warm wooden handle, cream ferrule, and butter-yellow paint-tipped bristles. Beside its lower-left edge sits a simple oval painter's palette with four small scalloped paint blobs in muted coral, butter yellow, sage green, and powder blue. Include one or two small soft white paint tubes with pastel color bands and a little matching paint puddle. Two small overlapping color-study cards can peek out behind the mascot, each with a simple pastel color patch, no writing. Keep all objects in the compact right-center cluster, with the mascot clearly dominant.

Style/medium: cute hand-drawn CARTOON with large areas of SOLID low-to-medium saturation color, polished flat casual game illustration. Warm dark brown hand-inked outlines approximately #6d6854, with gentle irregularity; smooth flat pastel fills; tiny flat warm grounding shadows only. The mood is friendly, cozy, playful, and calm. Off-white character, muted mint/sage, coral, powder blue, butter yellow accents, warm cream background. Think a charming illustrated paint-box companion matching a pastel mint game console.

Constraints: clean crisp flat fills, minimal detail, no texture and no complex gradients, very little shading, no lighting effects. Preserve the large empty left region and quiet top and bottom margins. No text, letters, logos, watermark, interface, buttons, screens, photorealism, 3D rendering, glass, glow, neon, dark background, realistic lighting, allover grain, stripes, table edge, or decorative confetti outside the cluster.
```
