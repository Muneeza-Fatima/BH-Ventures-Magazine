# Image Brief — BH Ventures Magazine, Edition 01

**Seventeen pictures.** Ten are the ventures, one to a page. Seven are editorial
frames. One of those already exists as a real photograph, so **sixteen** are
yours to generate.

**Every venture image is the literal subject of its service.** A reader looking
at *Foodstuff Trading* should see food; a reader looking at *New Automobile
Trading* should see cars. Nothing abstract, nothing decorative.

Generate, save with the filename given, drop into `assets/images/raw/`, then:

```bash
npm run images:grade
npm run build
```

Cropping, grading and colour matching are automatic. **Nothing in the layout
moves** — each picture drops into a frame that is already built for it. Until
then its page shows a designed icon plate, so the magazine is complete and
printable today.

---

## Technical — non-negotiable

| | |
|---|---|
| **Size** | **2400 × 1700 px minimum.** A generator's default 1024 px prints visibly soft at 156 mm wide. Bigger is better; it leaves room to crop. |
| **Shape** | **Square-ish or 3:2 landscape** for the ten ventures — their frame is 156 × 158 mm, very close to square. **4:3 landscape** for the editorial frames. |
| **Format** | JPG or PNG. Never upscale a small image to meet the size; the softness stays. |
| **Filename** | Exactly as listed. The build matches on the name and nothing else. |

---

## Direction — this is what stops it looking generated

**Ask for a photograph, not a render.** Put this in every prompt:

> `documentary photograph, natural light, shallow depth of field, 35mm`

The glossy, over-lit, hyper-saturated CGI look is the clearest tell there is.
Trade subjects — ports, ships, warehouses, cranes, cargo — are the category
generators handle most convincingly, because there are no faces and no hands to
get wrong. Lean into that.

**Bright, not moody.** This is new, and it matters. The magazine used to be a
dark book, so the old brief asked for dim rooms and dusk. It is now a light
book — white paper, rounded frames — and a dark photograph sits on a white page
like a hole. Ask for **bright, airy, high-key, clean daylight** every time. Keep
the documentary instruction; only the light changed.

**Dubai, specifically.** The client asked for this directly, and it is the
difference between a brochure about *a* company and one about *this* one. A
desk, a warehouse or a monitor wall could be anywhere; put the city in the
frame — a skyline through the window, Gulf daylight, desert haze on the horizon,
the particular white glare of a UAE afternoon.

**Five exclusions.** Add to every prompt:

> `no text, no writing, no signage, no logos, no brand names, no close-up faces`

1. **No text anywhere in frame.** Container markings, hull names, road signs,
   number plates. Generated lettering comes out as convincing gibberish and
   there is no fixing it afterwards. This is the second clearest tell.
2. **No logos or brand marks.** Another company's mark in a BH Ventures
   magazine implies a relationship that does not exist. This is not
   theoretical: **two real photographs were thrown out of this magazine for
   exactly that** — a Dubai Marina cover carrying "DAMAC" on a tower, and a
   Burj Khalifa frame carrying "Fakhruddin", which had to be cropped out. It is
   the single most common reason a good picture cannot be used.
3. **No close-up faces.** Mid and wide shots only; people as small figures for
   scale, if at all. Faces and hands are where the eye goes first.
4. **Nothing physically impossible.** Cranes lifting nothing, cargo floating,
   shadows in two directions. Look at each image for ten seconds before
   accepting it.
5. **No generator watermarks.**

**One light across all sixteen.** Every prompt below says **daylight** or
**morning**. Sixteen images in sixteen different lights look like sixteen stock
photos; sixteen in one light look like one commission. This matters more than
any single image being perfect.

---

## Which tool

Any generator will do, but if you have a choice:

- **Midjourney v7** is the most photoreal. Append `--ar 3:2 --style raw --v 7`
  to the prompts below (`--ar 1:1` for the ten ventures, whose frame is nearly
  square). `--style raw` is the important one — it turns off the house
  look that makes images read as generated.
- **Gemini / Nano Banana** is the best at *fixing* a frame you otherwise like.
  If a good image has a sign, a logo or a stray line of text in it, ask it to
  remove that element rather than rerolling the whole picture.

The prompts below are written as plain English and work anywhere.

---

## The ten ventures

One to a page, pages 10–19. Each runs **156 × 158 mm** in a rounded frame,
tilted a few degrees, so it is the first thing seen and it has to hold up in
print. A near-square crop: compose accordingly.

### `ventures-automobile.jpg` — 01 · New Automobile Trading (Export)
> Documentary photograph of rows of brand-new cars parked on a Dubai port
> quayside waiting to be loaded onto a vehicle carrier ship, the ship's open
> stern ramp behind them, bright clear morning light, Gulf haze and distant
> towers on the horizon, wide shot, 35mm

### `ventures-foodstuff.jpg` — 02 · Foodstuff Trading
> Documentary photograph of fresh dates in pale wooden crates stacked for
> export in a bright airy warehouse, deep amber fruit, sunlight through a high
> window, shallow depth of field, 35mm

*Dates are deliberate. It is the one image that could only belong to a Gulf
company, and anyone in the trade will read that instantly.*

### `ventures-web3.jpg` — 03 · Web3 Venture Studio
> Documentary photograph over the shoulder of a developer's desk in a bright
> modern Dubai office, several monitors showing abstract network node diagrams,
> daylight from floor-to-ceiling windows with a skyline beyond, no readable
> text, no faces, 35mm

### `ventures-analytics.jpg` — 04 · Digital Analytics Services
> Documentary photograph of a wall of monitors showing charts and dashboards in
> a bright operations room, daylight from a window wall overlooking a Gulf
> city, no readable text or numbers on the screens, no faces, 35mm

### `ventures-social.jpg` — 05 · Marketing via Social Media
> Documentary photograph of a bright content studio mid-shoot, a phone mounted
> on a tripod facing a lit product table, white softboxes either side, clean
> daylight balance, no faces, 35mm

### `ventures-ads.jpg` — 06 · Advertising
> Documentary photograph of tall blank advertising billboards beside a wide
> desert highway outside Dubai in clear morning light, a modern skyline far
> behind in the haze, the billboard faces completely empty with no images or
> text, 35mm

### `ventures-manage.jpg` — 07 · Marketing Management
> Documentary photograph of a campaign planning wall in a bright Dubai office,
> printed layouts and timeline cards pinned in a grid, a pale meeting table in
> the foreground, strong daylight from a window, no readable text, no faces,
> 35mm

### `ventures-ai.jpg` — 08 · AI Research & Consultancies
> Documentary photograph of a clean bright AI research floor, tall server racks
> on one side and a robotic arm on a test bench on the other, cool even
> daylight, no faces, no screens with text, 35mm

### `ventures-survey.jpg` — 09 · Surveying & Evaluating
> Documentary photograph of a surveyor's total station on a tripod on an
> unfinished Dubai construction site, high-rise towers rising behind it in the
> morning haze, bright clear light, no faces, 35mm

### `ventures-exhibition.jpg` — 10 · Exhibition Organizing
> Documentary photograph of a large bright exhibition hall in Dubai being built
> out the day before opening, modular stands half-assembled, high ceiling with
> daylight flooding in, no signage or text anywhere, 35mm

---

## The seven editorial frames

One is already in place as a real, licensed photograph:

| Page | File | Status |
|---|---|---|
| 4 · The Opening | `opening-burj-dusk.jpg` | **In place.** Dubai skyline at dusk, CC BY 2.0 |

Six are yours. Each page is **already complete without its picture** — it falls
back to an icon plate or a navy page, which is a design rather than a gap. Add
them when you can; nothing breaks either way.

### `cover-dubai-hero.png` — page 1 · THE COVER — **in place, but soft**

**A CUT-OUT, not a photograph.** Three Dubai towers with no background
at all, standing on the white page and running off the bottom edge. The
supplied artwork is in and the cover is built around it.

> Three modern Dubai skyscrapers of different heights standing together,
> isolated on a pure white background, complete buildings from base to
> spire, bright even neutral daylight, sharp glass and steel detail,
> photorealistic architectural photography.
> No sky, no ground, no shadow, no text, no signage, no logos, no people.

The white ground is removed automatically — `grade-images.mjs` flood-fills
it from the border and writes a PNG with real transparency, so a pure
white or transparent background both work. What it cannot fix is
resolution.

**THE ONE THING STILL OUTSTANDING: the file is 1024 px wide.** On the
cover the towers print about 100 mm across, which is roughly 195 dpi
against the 300 dpi a printer wants. It is fine on screen and fine for
the client to approve; it will look soft on paper. Re-generate the same
prompt at **2048 px or more** before this goes to press — Midjourney's
upscale, or the generator's high-resolution setting. Do not enlarge the
existing file in software: upscaling keeps every bit of the softness and
only adds weight. `npm run images:grade` warns about this on every run.

Two hard requirements, both learned the expensive way:
- **No legible building name anywhere.** Two covers were already thrown
  out for this.
- **Unmistakably Dubai.** One earlier cover was rejected because the
  client read it as Doha. The Burj in the middle of the group settles it.

### `company-portfolio.jpg` — page 6 · Portfolio Spans
> Documentary photograph looking down a modern Dubai free-zone business
> district in bright late-morning light, glass towers and a wide clean
> boulevard, no signage, no faces, wide shot, 35mm

### `ventures-opener.jpg` — page 9 · The Ventures
> Documentary photograph of a large container terminal at Jebel Ali in clear
> morning light, stacked containers and gantry cranes receding into the Gulf
> haze, no readable markings on the containers, no faces, wide shot, 35mm

### `connections-port.jpg` — page 22 · Global Connections
> Documentary photograph of a container ship being worked alongside a quay in a
> Gulf port, cranes above it, calm water in the foreground, bright morning,
> plain unmarked containers, no faces, 35mm

### `future-construction.jpg` — page 25 · The Future
> Documentary photograph of tower cranes over a half-built high-rise in Dubai
> in bright morning light, concrete cores and scaffolding, the skyline hazy
> behind, no signage, no faces, wide shot, 35mm

### `opening-dubai-bright.jpg` — page 4 · optional replacement
Only if you want the opening spread brighter than the dusk frame now in place.
Same subject, same viewpoint, morning instead of evening.

> Documentary photograph of the Dubai skyline across the water in clear morning
> light, the towers sharp against a pale sky, no text, no signage, wide shot,
> 35mm

---

## Checking what comes back

Before dropping an image in:

- [ ] At least 2400 px on the long edge
- [ ] It is unmistakably the subject of that service
- [ ] **No text, no logos, no watermark anywhere in frame** — zoom to 100% and
      look at every building, hull, crate and screen
- [ ] No faces close enough to read
- [ ] Hands, wheels, railings and shadows all make physical sense
- [ ] It is **bright**, and its light matches the others
- [ ] It reads as Dubai, not as anywhere

Then `npm run images:grade && npm run build`, and look at the page.

**The test that matters:** cover the caption and the headline. Someone who has
never read the magazine should be able to name the service from the picture
alone. Cars mean cars. Dates mean dates.
