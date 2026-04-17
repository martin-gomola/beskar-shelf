---
name: abs-cover-generator
description: >-
  Generate or improve Audiobookshelf-compatible book covers for this repo.
  Use when the user wants a better cover, square cover art, refreshed artwork,
  thumbnail-safe typography, or a layout-friendly 1:1 cover that can be saved
  as cover.jpg for ABS.
---

# ABS Cover Generator

Repo-local guidance for creating better book covers that fit the Beskar Shelf
UI and Audiobookshelf well.

## Goal

Produce clean, readable cover art that works well in square UI slots.

Default target:

- 1:1 aspect ratio
- final file saved as `cover.jpg`
- JPG output with no transparency
- strong readability at thumbnail size

This repo's UI uses square cover surfaces with `object-fit: cover`, so square
covers are the safest default and usually save space in the layout better than
tall portrait artwork.

For final covers, do not trust image-model text rendering for the real title or
author line. Generate the artwork background first, then render title and
author as a separate deterministic text layer with the bundled script.

## When To Use

Use this skill when the user asks to:

- generate a new book cover
- improve or refresh an existing cover
- make a cover more readable in Audiobookshelf
- convert portrait cover art into a square, layout-friendly version
- create cover art that is safer for thumbnails or mobile cards

## Cover Rules

- Prefer `1:1` covers unless the user explicitly asks for another ratio.
- Prefer `1600x1600` or larger square output, then export a compressed JPG.
- Use a solid or fully rendered background. Do not leave transparency.
- Keep the main title inside the central safe area.
- Leave generous padding near all edges so thumbnail crops do not cut text.
- Favor bold, high-contrast title treatment over tiny subtitle/detail text.
- Keep author text smaller than title text.
- Avoid fake device frames, book mockups, spines, drop shadows outside frame,
  and extra border treatments unless the user asks for them.
- Avoid tiny decorative elements that disappear in list/grid thumbnails.
- Prefer background art without any baked-in title text when creating a new
  cover from scratch.
- Treat exact spelling, accents, and diacritics as a local text-rendering job,
  not an image-generation job.

## Prompting Workflow

1. Collect the minimum facts:
   title, author, genre, tone, and whether the user wants to preserve the
   current cover's vibe.
2. If an existing cover is available, prefer editing or reinterpreting it
   instead of changing the visual identity completely.
3. Ask the image model for a square composition first, not a portrait crop.
4. Explicitly request:
   "book cover", "1:1 ratio", "clean centered composition", "safe margins",
   and "no visible title text, author text, badges, or logos".
5. After the background image is ready, render the exact title and author with
   `scripts/render-cover-text`.
6. If an existing AI-generated cover already has wrong text, prefer replacing
   the text locally instead of regenerating the whole scene again.

## Recommended Prompt Shape

Use a prompt with these parts:

- subject and mood
- genre cues
- square composition requirement
- no-text requirement for the generated art
- output format preference

Example pattern:

```text
Create a premium book cover for "{TITLE}" by {AUTHOR}. Genre: {GENRE}.
Mood: {MOOD}. Use a clean 1:1 square composition designed for Audiobookshelf
and small thumbnail views. Preserve safe padding on all sides and leave room
for a separate title treatment to be added later. Do not render any visible
title text, author text, logos, badges, mockups, spines, borders, or clutter.
Deliver background artwork suitable for export as a high-quality JPG cover.
```

## Deterministic Text Pass

Use the bundled helper after generating or selecting background art:

```bash
.agents/skills/abs-cover-generator/scripts/render-cover-text \
  --input /path/to/background.jpg \
  --output /path/to/cover.jpg \
  --title "Kliatba na Zobore" \
  --author "Juraj Červenák"
```

What this does:

- keeps the artwork background from the image model
- renders exact title text locally
- preserves accents and diacritics reliably
- writes a square cover with a clean title panel for ABS-safe readability

Use this even when the generated cover already contains text if the spelling is
wrong or the typography is messy.

## Output Rules

- Final preferred filename: `cover.jpg`
- Preferred color space: sRGB
- Preferred format: JPG
- Keep file size reasonable for library browsing
- If the generated asset is PNG/WebP, convert/export to JPG before final use

## ABS Compatibility Notes

- Audiobookshelf works well with `cover.jpg` alongside the book files.
- Square covers are a better fit for this repo's browsing and player UI.
- If the user also wants the new cover applied in ABS metadata workflows,
  combine this skill with `abs-library-manager`.

## Quality Bar

Before finishing, verify:

- the cover is square
- title and author text match the exact requested spelling
- title remains readable at small size
- no important text sits near the edges
- the image still works when visually cropped into a square thumbnail
- the final deliverable can be saved or converted to `cover.jpg`
