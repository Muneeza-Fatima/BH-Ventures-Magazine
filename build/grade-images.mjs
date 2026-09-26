/* ============================================================
   grade-images.mjs — bake the photography.

   THE RULE: photographs stay photographs. Dubai's sunset stays
   orange, the containers keep their colours, golden hour stays
   golden. Warmth and variety in this magazine come from the
   pictures, not from the palette.

   So there is no duotone here and no recolouring. There are only
   two grades:

     R  Realistic. Full colour. Just enough normalisation that ten
        photographs from ten sources read as one commission:
        a little contrast, a little desaturation, and a slightly
        cooler shadow so they sit against the navy. Highlights are
        left alone — that is what keeps them looking real.

     S  Scrim. Grade R, plus a navy gradient over ONLY the band
        where type sits. The photograph is never darkened as a
        whole; it is darkened locally, where the words need it.
        This is what magazines actually do.

   And it is all baked into the JPEG here, at build time. The
   reference sample did its grading with CSS blend modes, which
   exported into the PDF as 44 luminosity soft masks — and pdf.js,
   which is Firefox's built-in PDF viewer, rendered every one of
   those photos hot pink. Baked pixels cannot do that.

   Usage: node build/grade-images.mjs [slug ...]
   ============================================================ */

import sharp from 'sharp';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'assets/images/raw');
const OUT = resolve(ROOT, 'assets/images/graded');
mkdirSync(OUT, { recursive: true });

const MM = (mm, dpi) => Math.round((mm / 25.4) * dpi);

/* Target boxes, in millimetres on the page. Resolution follows the
   placement: a full-bleed page needs 2551px across at 300dpi, a
   62mm card needs 732. Oversampling a card to 2551px would just
   inflate the PDF. */
const BOXES = {
  page: { w: 216, h: 303 },   // full-bleed, incl. bleed
  half: { w: 216, h: 165 },   // full-width band
  /* The opening photograph. 170mm rather than a full page on
     purpose: this frame is 4032x3024, so cropping it to the
     303mm portrait page would upscale it by 18% AND throw away
     the wide horizon that is the whole reason the picture
     works. A band keeps both the sweep and the resolution. */
  banner: { w: 216, h: 170 },

  /* p4, the opening band. 216 x 144mm is EXACTLY 3:2, which is
     exactly the aspect of the frame that goes in it - so the page
     crops it a second time by nothing at all. That is the whole
     reason for the number. The client's instruction on the cover
     was that the picture must not be cut, and the same applies
     here: an interior with a tower centred in the window has no
     spare edge to lose. */
  office: { w: 216, h: 144 },

  /* p5, the terrace band at the foot. 216 x 153mm is 1.412:1,
     which is the frame's own 1491x1055 to within a pixel - so
     again nothing is cropped a second time. Taller than p4's band
     because this one has to hold the bottom half of a page rather
     than the top third. */
  terrace: { w: 216, h: 153 },

  /* p6, the atlas band. The only box on the page that is NOT cut
     to its source aspect, and deliberately: the frame is 1.41:1
     and a world map wants to be wide. 216 x 110mm is 1.96:1, so
     the crop takes empty ocean off the top and the bottom and
     leaves every landmass inside the frame - checked against the
     source, not assumed. */
  atlas: { w: 216, h: 110 },
  card: { w: 62, h: 44 },     // venture card
  /* The venture picture, p9-18. 190 x 114mm - 13mm in from each
     paper edge, which is 10mm of clear paper either side of it on
     the trimmed sheet, at the same 1.67:1.

     It ran off both edges before. The client asked for breathing
     space at the sides and a border round the picture, and the
     aspect was kept to the millimetre while the width came down
     so that the crop did not change with the frame - the same
     part of every photograph is still in view.

     Narrowing it also BOUGHT resolution, which is the one thing
     this book is short of: the same file over 190mm instead of
     216mm is 184 dpi rather than 162.

     This number had drifted and it cost every one of the ten
     pages. The box was 190 x 132mm, a framed landscape, while the
     CSS frame it went into was 156 x 158mm, nearly square - so
     every venture photograph was cropped ONCE here to one aspect
     and then a SECOND time by object-fit against another. The
     sides came off ten pictures and no check could see it. The
     box and the frame are now the same rectangle, which is the
     rule the cover band states in its own comment.

     1.67 was chosen against the frames that exist rather than in
     the abstract: nine of the ten come in at 1.77-1.79 and lose
     6% off the width, and the warehouse at 1.41 loses its
     ceiling, which is the part of a warehouse nobody needs. */
  feature: { w: 190, h: 114 },

  /* p19, the people plate. The same 190mm placement the ventures
     use, cut to 2.11:1 rather than 1.67 - a panorama, because
     what the frame is about is four people crossing a space, and
     the ceiling and the floor of an atrium are not the subject.
     The crop takes 15% off the height and every figure and the
     skyline behind them stay in. */
  atrium: { w: 190, h: 90 },

  /* p20, the window plate. The first PORTRAIT placement in the
     book - 70 x 125mm at 0.56:1, which is the frame's own
     0.558 to within half a percent.

     It is also the first placement that reaches print
     resolution. 768px over 70mm is 279 dpi, against 160-190
     everywhere else, and the reason is simply that this picture
     is used small. Every other photograph in the book is asked
     to cover 190mm or more of a sheet it was never shot for. */
  portrait: { w: 70, h: 125 },

  /* p21, the corridor plate. 190 x 106mm is the frame's own
     1.792 to within a pixel, so nothing is cropped a second
     time - the same rule the venture plate follows, at the same
     190mm width, so the two sections line up down the book. */
  corridor: { w: 190, h: 106 },

  /* p23, the marina plate. The second portrait placement, and
     bigger than the first: 90 x 219mm. It is the only
     placement in the book cut AWAY from its own aspect on
     purpose - 0.411 against the frame's 0.558 - and the reason
     is the page rather than the picture. The plate has to run
     the full height of the sheet beside a column of type, and at
     the frame's own proportion a 219mm-tall plate would be
     122mm wide and leave 42mm for the words. The crop takes 13%
     off each side; the towers and the road all stay in.
     768px over 90mm is 217 dpi - not 300, but
     the second best number in the book, and for the same reason
     as the first. Portrait frames are used narrow here, and a
     narrow placement is a dense one. */
  marina: { w: 90, h: 219 },
  tall: { w: 96, h: 130 },    // portrait column

  /* The rounded frames the light design is built from. These are
     the real placements now: almost nothing bleeds any more, so
     almost nothing needs the full page box. */
  cover: { w: 174, h: 140 },  // p1, when the cover art is a photograph
  cutout: { w: 158, h: 212 },  // p1, when it is a cut-out building

  /* p1, when the cover art is a full-bleed photograph behind the
     type. Not 'cover' (174x140, a framed picture on white) and not
     'page' (216x303, the whole sheet).

     THIS NUMBER MUST TRACK .cover__ground IN magazine.css. The band
     takes the top 22% of a 303mm page, so the picture occupies
     216 x 236mm. If the two drift apart the page crops the graded
     file a SECOND time - object-fit:cover against a slot of a
     different aspect - and that second crop takes the sides off
     the towers, which no amount of grading can put back.

     THE BAND WAS FOUND BY BRACKETING IT, not by choosing it. At
     32% there was dead paper under the logo and the masthead
     floated in a half-empty third. At 22% the gap closed
     completely and the logo sat straight on the picture, which
     reads as a collision rather than as a composition - a mark
     needs air under it or it looks dropped in. 26% is the middle
     and it is what balances: about 20mm of clear paper below the
     lockup, which is a little more than the 14mm above it, so the
     logo sits high in its band rather than centred in it.

     The cost is honest and small. Every millimetre the band takes
     is a millimetre off this box, and a shorter box crops more of
     a 0.667 portrait source: 73% of the frame survives at 22%,
     69% at 26%. Four percent of the towers for the logo to stop
     touching the roofline. */
  coverband: { w: 216, h: 242 },
  /* p2, the two inset frames. Their aspects are taken FROM the
     pictures rather than chosen, and that is the point: the page
     crops a graded file a second time whenever the box and the
     CSS frame disagree, and that second crop is the one nobody
     sees coming. 96x54 is 1.778 against the facade's 1.792;
     62x104 is 0.596 against the tower's 0.597.

     The facade stays LANDSCAPE. Cutting it to a portrait column
     would have thrown away 59% of its width and taken it from
     364dpi to 150 - the frame follows the photograph here, not
     the other way round. */
  slab:  { w: 84, h: 47.3 },  // p2, the facade detail   (1.776)
  /* Both boxes are cut to their own picture's aspect to the third
     decimal - 84/47.3 is 1.776 against the facade's 1.7768,
     64/107.3 is 0.5965 against the building's 0.5966. A box that
     disagrees with its frame gets the file cropped a SECOND time
     by object-fit, and that second crop is the one nobody sees
     coming. BOXES.coverband carries the same warning, and the ten
     venture pages still have the fault.

     THE BUILDING FRAME IS 64mm WIDE, AND THAT IS A RESOLUTION
     DECISION rather than a compositional one. Its panel is 559px:
     at 70mm that is 203dpi, at 64mm it is 222, and it would need
     to come down to 47mm to reach 300. 64 is the compromise -
     wide enough to read as a building, narrow enough that the
     softness is not the first thing on the page. */
  tower: { w: 64, h: 107.3 }, // p2, the whole building  (0.597)
  wide: { w: 174, h: 90 },    // p22, p25
};

const PLAN = {
  /* ---------- THE COVER --------------------------------------
     Burj Khalifa at night, from across the water.

     Two photographs were replaced to get here, and both for
     reasons that had nothing to do with how good they were:

       Dubai Marina, golden hour  - a tower in frame carries
         "DAMAC" in legible type. Another developer's brand on the
         front of a BH Ventures magazine implies a relationship
         that does not exist.
       Business Bay, night        - the client read it as Doha.
         A cover photograph that has to be defended has already
         failed, whether or not the reading is fair.

     Burj Khalifa answers both: nobody mistakes it, and the frame
     is genuinely dark rather than darkened.

     It no longer carries the lockup. The whole point of the old
     grade was a navy scrim over the empty night sky so a white
     mark could sit on it - "logo apne background ke saath merge
     ho jaye" - and the redesign moved the mark onto the paper,
     above a rounded frame. So the scrim is gone and the grade is
     plain: a scrim exists to make type readable, and there is no
     type on this picture any more.

     It is still a night photograph on a white page, which reads
     heavy. The frame it really wants is bright; that is
     cover-dubai-hero below.

     rotate: the file carries EXIF orientation 6, so its stored
     pixels are landscape and its true frame is portrait. Without
     the rotate the crop below would cut the wrong axis.

     extract: 2500px of the 3024 available, from the left. The
     tower at the right edge carries "Fakhruddin" in lit type -
     the same fault as the Marina frame, so it is cropped out
     rather than argued with. 2500px across 216mm is 294dpi. */
  'cover-burj-night': {
    box: 'cover', grade: 'R', rotate: true,
    extract: { left: 0, top: 0, width: 2500, height: 3507 },
  },

  /* THE COVER. Three Dubai towers, cut out, standing on the paper.

     Not a photograph in a frame. A framed photograph on a white
     cover is a brochure device - the client sent us one and then
     told us the panel behind the headline did not look
     sophisticated, which is the same complaint. A cut-out building
     rising off the bottom edge is a magazine device: the picture
     does not sit ON the page, it grows OUT of it.

     Three towers rather than one. A single tower stands thin in the
     middle of a portrait page and leaves both sides empty; three
     different silhouettes fill the measure and, for a company whose
     whole argument is ten disciplines under one roof, three is the
     more honest picture. The middle one is Burj Khalifa, which
     settles the question an earlier cover lost - that frame was
     rejected because the client read it as Doha. */
  'cover-dubai-hero': { box: 'cutout', grade: 'R', cutout: true },

  /* THE COVER, as shipped. One tower, not three.

     Three towers was the first choice and it was wrong, for a
     reason that is pure arithmetic rather than taste: a cover
     headline needs about 110mm of measure to be set large, the
     three-tower group needs about 150mm to read as a group, and
     an A4 page is 216mm wide. They cannot both be on it. Every
     attempt to fit them ended with the type behind a building.

     One tower is 0.316 wide to tall. At full page height it takes
     84mm and leaves 94mm for the headline beside it, which is a
     cover. The three-tower frame is kept and graded - it is the
     right picture for a chapter opener, where nothing competes
     with it. */
  /* THE COVER, as shipped. A wide Dubai skyline across water:
     Cayan, Princess Tower, Burj Khalifa, The Address.

     WIDE IS THE POINT, and it is not only composition. A single
     tower is 0.316 wide to tall, so at any useful size on the page
     its spire reached the masthead - and the client asked plainly
     that the building not run into BH VENTURES. A 1.79 frame at
     190mm across stands only about 106mm tall. The instruction is
     satisfied by the picture itself, not by trimming it.

     The sky is already white (253-255), so the ordinary white key
     works. The water is not white and runs to the frame edge, so
     the fill leaves it alone: the skyline keeps its base. */
  /* duotone removed: the client asked for the buildings not to be
     blue, and it is moot in any case - the cut-outs are off the
     cover entirely now. See the block below. */
  'cover-dubai-skyline': { box: 'cutout', grade: 'R', cutout: true },

  'cover-dubai-tower': { box: 'cutout', grade: 'R', cutout: true },

  /* ---------- THE COVER, as a PHOTOGRAPH ---------------------
     Every cut-out above is retired from the front. Three reasons,
     and the first two are measurements rather than taste.

     THEY CANNOT PRINT. The cutout box is 158mm wide, which needs
     1866px at 300dpi. Every cut-out source is 768-1024px and
     withoutEnlargement will not invent the rest, so what actually
     ships is cover-dubai-skyline@300.png at 616px - about 99dpi -
     and cover-dubai-tower@300.png at 475px, about 88. The grader
     has been printing "source is thin for this placement" on
     every run since they were added.

     A CUT-OUT CANNOT BE A REAL PHOTOGRAPH, here. cutOut() finds
     the ground by flood-filling from the border with BG_MIN 248,
     so it needs a near-white, unbroken background. Real Dubai
     frames have haze, other towers and water; they will never
     separate. Only an AI render gives a clean white ground -
     which means asking for a cut-out was, in practice, asking for
     an AI render. That is the loop this book has been stuck in.

     AND THE CUT-OUT IS WHAT MADE IT LOOK FAKE. It removes the
     sky, the haze and the light, which are the things that tell
     an eye a place is real. The client's own words were that the
     buildings looked like they had been stood up with gaps
     between them.

     So the navy block becomes the picture and the type sits on
     it. Three candidates, one layout, judged on the page:
     all three are real photographs, all are Dubai, and all are
     3.7x to 7.8x the pixels of the best cut-out. */

  /* Burj Khalifa centred in the full Downtown skyline at dusk,
     water across the foot. Warm, not blue. 4032px across a 216mm
     box is 474dpi. The sky darkens toward the top of the frame,
     which is where the headline goes - so 'bottom' is the scrim,
     doing its work in the water under the cover lines rather
     than over a sky that is already the right value. */
  /* THE COVER as it now stands: Downtown Dubai on a clear late
     afternoon, the Burj centred with four or five towers layered
     in front of and behind it.

     This is the first generated frame that met the brief, and the
     two things that make it work are the two that every earlier
     attempt was missing. The towers OVERLAP - there is no empty
     sky standing between them, which is what made the previous
     renders read as buildings propped up in a row. And the light
     is DIRECTIONAL: every tower has a lit face and a shadowed
     one, so the frame has depth instead of being a flat elevation.

     focus 'top', NOT the default 'centre'. The source is portrait
     at 0.667 and the box is square at 1.038, so fit:'cover' throws
     away a third of the frame. Centred, that third comes off the
     top and the bottom equally - and the top is the Burj's spire,
     which is the whole subject. Cropping from the top keeps the
     sky, the spire and the towers, and loses the podiums and palms
     at the foot, which is what a page edge does anyway.

     RESOLUTION IS SHORT and the grader will say so. The source is
     1024px across a 216mm box, about 120dpi where 300 is wanted.
     The frame is right; the file is not big enough yet. Until it
     is regenerated or upscaled this is a proof, not print. */
  /* THE COVER, and it is the cloth frame now - the two pictures
     traded places.

     WHY. The skyline that was here was a good photograph of the
     most photographed view on earth: Burj, sunset, water. It had
     no idea in it and could have belonged to anyone. The cloth
     frame has one - a building being unveiled, which is what a
     first edition is - and the Burj Khalifa stands in it anyway,
     clear behind the tower to the left. The strongest picture in
     the book was on page two.

     focus 'bottom', NOT the default 'top'. The box crops a
     0.667 source to 0.893 and throws away a quarter of the
     height; from the top that quarter is the Burj, the palms and
     the water, which is the half of the frame that says Dubai.

     NO SCRIM. The statement is navy on a pale sky here, the same
     way round as page 2 - so a navy wash greys the sky, closes
     the gap between type and ground, and makes the headline
     harder to read rather than easier. That has now been measured
     twice on this book, once in each direction. */
  /* focus CENTRE - the default, and it is a compromise rather
     than a choice.

     The source is 2:3 and this box is 0.893, so a quarter of the
     height goes whatever happens; to lose nothing the slot would
     have to be 216 x 324mm and the sheet is 303. From the bottom
     the quarter came off the top and took the tower's crown with
     it, which reads as an accident. From the top it takes the
     Burj and the water. Centred, the crown survives at the head
     and the Burj at the foot, and what goes is the open water in
     the foreground - the least of the three.

     The real fix is a source cut nearer 8:9. */
  /* THE COVER, back to the Downtown skyline at dusk.

     The cloth frame was on here for a while and it has gone back
     to page two. Both are good photographs; this is the one the
     client kept, and the layout is cut for it - white type
     reversed out, which is why the scrim below is navy rather
     than the paper-coloured one the cloth frame needed. */
  'cover-day-close': { box: 'coverband', grade: 'R', scrim: 'coverphoto', focus: 'top' },

  'cover-burj-dusk': { box: 'coverband', grade: 'R', scrim: 'bottom' },

  /* Business Bay at night: Burj centred, towers either side, the
     whole thing doubled in still water. The most dramatic of the
     three and the highest resolution with a Burj in it - but it
     is a night frame and its cast is blue, which is the one thing
     the client ruled out. Included because it should be judged on
     the page rather than on that sentence. 'night' is the scrim
     built for exactly this frame. */
  'cover-bay-night': { box: 'coverband', grade: 'R', scrim: 'night' },

  /* Dubai Marina at sunset - the widest sweep, the warmest sky and
     6000px, the sharpest file in the book. Its problem is not
     quality: there is NO BURJ KHALIFA in it, and the client asked
     for the Burj by name. It also carries EMAAR on the beach and
     construction cranes on the right. 'cover' is the scrim that
     was tuned for this exact frame. */
  'cover-marina-dusk': { box: 'coverband', grade: 'R', scrim: 'cover' },

  /* Wired to the fetcher's own slug. build/fetch-images.mjs has
     asked Commons for "Downtown Dubai skyline" at >=3000px since
     the beginning, but there was no PLAN entry to grade what it
     brought back - so anything it fetched was skipped in silence.
     Now a fetch produces a fourth candidate. */
  'cover-dubai-real': { box: 'coverband', grade: 'R', scrim: 'bottom' },

  /* ---------- p2, THE INSIDE FRONT ---------------------------
     Two inset frames on a white page, not one full-bleed picture.

     WHY THEY MATCH THE MARK. The logo is flat angular planes with
     mitred 45-degree corners, vertical slabs separated by narrow
     voids, in a teal gradient, drawn face-on. Both frames are
     those five things photographed: slabs, slots, mitres,
     interlocking planes, teal glass, camera level. One is the
     detail, one is the whole building, and they were generated
     from the same prompt family so the light matches.

     NO SCRIM ON EITHER. A scrim exists to make type readable over
     a picture. The type now sits beside them on white, so a scrim
     would only make both frames read darker than the page they
     are inset into.

     THE FACADE IS LANDSCAPE AND STAYS LANDSCAPE. It arrived
     1376x768. Forced into a portrait column it would keep 567px
     of width - 150dpi - where left alone across 96mm it is 364.
     The reference the client sent pairs a landscape detail with a
     portrait building, which is what these two are.

     THE TOWER IS STILL SHORT. 376px across 62mm is about 154dpi
     against 300 wanted, and the grader says so below. It arrived
     as one panel of a three-up contact sheet 630px tall - the
     third file in a row to be exactly 630px tall, which is a
     preview size, not an output size. The real file will be
     larger; this is in so the page can be judged. */
  /* THE GROUND. The page is now a photograph with the type on it,
     so this is the box that matters and the other two are insets
     on top of it.

     IT IS NOWHERE NEAR BIG ENOUGH and the warning below is right:
     the cloth panel is 559px against a 2551px page box, about
     66dpi. It is in so the layout can be judged. The frame this
     page actually wants - the tower against a Dubai skyline, sea
     and palms, which is what the client's reference shows - has
     to be generated at 2600px or more. Nothing about the layout
     changes when it arrives; only this file. */
  /* NO SCRIM, and that is the whole difference between this page
     and every other picture in the book. A scrim is a navy wash
     laid on so PAPER-coloured type can be read over a photograph.
     The type here is the opposite way round - navy on a pale sky -
     so the same wash greys the sky, closes the gap between type
     and ground, and makes the statement harder to read rather
     than easier. It was fitted with 'coverphoto' first and that
     is exactly what happened. */
  'imprint-slabs': { box: 'slab',  grade: 'R' },
  'imprint-tower': { box: 'tower', grade: 'R' },


  /* 01 THE OPENING. The same skyline an hour earlier - dusk, the
     tower in silhouette against an orange horizon. One
     photographer, two hours: the pair reads as a commission
     rather than as two stock frames. */
  'opening-burj-dusk': { box: 'banner', grade: 'R' },

  /* The frame in use. The skyline from inside a room, rather than
     from across the water: the tower is still the subject, but the
     desk in the foreground says who is looking at it, which is
     what an opening page is for.

     No scrim. A scrim exists to make type readable on a
     photograph and no type sits on this one - the statement is
     underneath it, on navy. Fitting one here would only grey the
     sky for nothing. */
  'opening-office': { box: 'office', grade: 'R' },

  /* 02 WHO WE ARE. The same city from a parapet at first light,
     and the pair is deliberate: p4 looks out through glass from
     inside a room, p5 stands outside on the stone. Read across
     the spread they are one morning, not two stock frames.

     No scrim, again - the pull-quote sits on the sky in NAVY
     rather than in white, so the picture wants to stay bright.
     Darkening it would work against the only type on it. */
  'company-terrace': { box: 'terrace', grade: 'S', scrim: 'parapet' },

  /* 03 WHERE WE OPERATE. A navy world with the routes drawn out
     of one point in the Gulf. It replaces the SVG map this page
     used to carry, and the trade is worth writing down: the SVG
     filled the nine markets by their real ISO country geometry,
     which this picture does not. The data has not been lost -
     the three lists underneath name every country, with its flag
     - but the map is now a picture of reach rather than a
     diagram of it. That was the client's call.

     No scrim. The frame is already navy; that is why it can hold
     this page's weight without a block behind the heading. */
  'world-atlas': { box: 'atlas', grade: 'R' },

  /* 05 THE PEOPLE BEHIND THE VISION. */
  'people-atrium': { box: 'atrium', grade: 'R' },

  /* 06 THE WAY WE CREATE VALUE. */
  'value-window': { box: 'portrait', grade: 'R' },

  /* 07 GLOBAL CONNECTIONS. */
  'connections-airport': { box: 'corridor', grade: 'R' },

  /* 10 LET'S BUILD. Same 190 x 106mm placement as the corridor
     plate - the frame is 1.792 as well, so nothing is cropped
     twice. */
  'build-table': { box: 'corridor', grade: 'R' },

  /* 09 THE FUTURE. */
  'future-marina': { box: 'marina', grade: 'R' },

  /* ---------- EDITORIAL FULL-BLEEDS --------------------------
     Optional. Every one of these pages is designed to be complete
     without its photograph - the markup asks {{#if}} and falls
     back to a deep navy page, which is a design rather than a
     gap. Drop the file in, re-grade, and the picture appears with
     nothing else moving. */
  'company-portfolio': { box: 'page', grade: 'S', scrim: 'bottom' },
  'ventures-opener': { box: 'page', grade: 'S', scrim: 'bottom' },
  'connections-port': { box: 'page', grade: 'S', scrim: 'bottom' },
  'future-construction': { box: 'page', grade: 'S', scrim: 'top' },

  /* ---------- THE TEN VENTURES -------------------------------
     One to a page, 190x132mm, so all ten are graded to the
     feature box. Every one is the literal subject of its own
     service: cars for automobile export, dates for foodstuff.
     Prompts are in IMAGE-BRIEF.md.

     Until a file arrives the page shows its icon plate, so the
     book is complete and printable today. */
  'ventures-automobile': { box: 'feature', grade: 'R' },
  'ventures-foodstuff': { box: 'feature', grade: 'R' },
  'ventures-web3': { box: 'feature', grade: 'R' },
  'ventures-analytics': { box: 'feature', grade: 'R' },
  'ventures-social': { box: 'feature', grade: 'R' },
  'ventures-ads': { box: 'feature', grade: 'R' },
  'ventures-manage': { box: 'feature', grade: 'R' },
  'ventures-ai': { box: 'feature', grade: 'R' },
  'ventures-survey': { box: 'feature', grade: 'R' },
  'ventures-exhibition': { box: 'feature', grade: 'R' },
};

/* --- Grade R -------------------------------------------------
   +6% contrast, -8% saturation, and a shadow that leans very
   slightly navy. The per-channel offsets do the last part: blue
   is pulled down least, so dark areas keep a little more blue
   while bright areas, which clip anyway, are untouched. */
const gradeR = (img) =>
  img.linear([1.06, 1.06, 1.06], [-8, -6, -2]).modulate({ saturation: 0.92 });

/* --- Grade H -------------------------------------------------
   The light cover. The photograph is LIFTED, not washed out: the
   sky and towers keep their own colour, the whole tone curve just
   moves up so dark type can sit on it. Desaturating it to a grey
   haze would be the easy version and would look like a mistake.

   The lift is applied as gamma plus a small linear raise, so the
   highlights compress rather than clip — clipped highlights are
   what make a lifted photo look like a faded photocopy. */
const gradeH = (img) =>
  img.linear(0.72, 62).gamma(1.12).modulate({ saturation: 0.86, brightness: 1.02 });

/* --- Grade S -------------------------------------------------
   The scrim is an SVG gradient composited over the photo. Each
   preset covers only the band where that page puts its type. */
function scrimSVG(kind, w, h) {
  const ink = '#0E1B2B';
  const stops = {
    // Cover: type sits top (kicker), upper-middle (logo) and lower
    // (headline). The middle band stays clear so the city reads.
    /* The lockup sits between 17% and 32% down the page. On the
       night frame that band was already dark; on the Marina frame
       it is the brightest part of the sky, and the mark's teal and
       the "FZE - LLC" line were disappearing into it. The scrim
       deepens across exactly that band and opens again over the
       towers, so the city still reads. */
    cover: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0.74"/>
      <stop offset="14%"  stop-color="${ink}" stop-opacity="0.50"/>
      <stop offset="30%"  stop-color="${ink}" stop-opacity="0.44"/>
      <stop offset="46%"  stop-color="${ink}" stop-opacity="0.16"/>
      <stop offset="66%"  stop-color="${ink}" stop-opacity="0.50"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.92"/>`,
    /* NIGHT COVER. The 'cover' preset above was tuned for a
       golden-hour frame whose sky was the brightest thing on
       the page and had to be pushed down hard. This frame
       arrives dark. Re-using those opacities would crush the
       city to black and throw the photograph away.

       So this one barely touches the sky the lockup sits in --
       it is already the right value -- opens over the towers so
       they keep their lights, and does its real work in the
       water at the foot, where the headline goes. */
    night: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0.34"/>
      <stop offset="16%"  stop-color="${ink}" stop-opacity="0.26"/>
      <stop offset="34%"  stop-color="${ink}" stop-opacity="0.22"/>
      <stop offset="52%"  stop-color="${ink}" stop-opacity="0.10"/>
      <stop offset="64%"  stop-color="${ink}" stop-opacity="0.34"/>
      <stop offset="80%"  stop-color="${ink}" stop-opacity="0.74"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.90"/>`,
    bottom: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0.10"/>
      <stop offset="42%"  stop-color="${ink}" stop-opacity="0.18"/>
      <stop offset="72%"  stop-color="${ink}" stop-opacity="0.68"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.94"/>`,
    /* Unused again. It is the one PAPER-coloured preset here - it
       lightens a picture so NAVY type can be read over it - and it
       was fitted while the cover carried the cloth frame and navy
       type. The cover reversed back to white type, so the navy
       'coverphoto' is correct again. Kept because the next light
       photograph will want it. */
    coverLight: `
      <stop offset="0%"   stop-color="#FAFAF8" stop-opacity="0.34"/>
      <stop offset="30%"  stop-color="#FAFAF8" stop-opacity="0.10"/>
      <stop offset="58%"  stop-color="#FAFAF8" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FAFAF8" stop-opacity="0.64"/>`,
    /* COVER PHOTOGRAPH, white type over a bright frame.

       Cut against a midday skyline whose sky is the lightest thing
       on the page: it opens at 0.22, deepens through the band the
       headline sits in, and reaches 0.78 at the foot where the
       teasers and the place stamp are.

       It was softened to 0.10-0.58 while the cover carried a dusk
       photograph - that frame arrived at the right value already
       and the deeper wash turned its amber to grey-green mud. The
       numbers here belong to the bright frame. Twice now, in both
       directions: a scrim is cut against the photograph under it,
       never chosen once and reused. */
    coverphoto: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0.22"/>
      <stop offset="28%"  stop-color="${ink}" stop-opacity="0.40"/>
      <stop offset="52%"  stop-color="${ink}" stop-opacity="0.58"/>
      <stop offset="74%"  stop-color="${ink}" stop-opacity="0.66"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.78"/>`,

    /* FOOT. Nothing for the top two thirds, then a fall into navy -
       for a page whose type is navy at the head and paper at the
       foot. Unused at the moment; kept because it is the only
       preset that leaves the top of a frame alone. */
    foot: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0"/>
      <stop offset="54%"  stop-color="${ink}" stop-opacity="0.02"/>
      <stop offset="64%"  stop-color="${ink}" stop-opacity="0.30"/>
      <stop offset="74%"  stop-color="${ink}" stop-opacity="0.74"/>
      <stop offset="86%"  stop-color="${ink}" stop-opacity="0.90"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.94"/>`,

    /* PARAPET. The gentlest of the set, and it is not here for
       type on the picture - the quote sits at the top, on the
       sky. It is here for the two things a photograph that bleeds
       off the bottom edge needs: the folio has to stay legible
       where it crosses the stone, and the frame needs some weight
       at the trim or it reads as falling off the page.

       It stops at 0.55. Going deeper would clear check-ink's
       floor for this page, and that is exactly why it does not:
       darkening the best part of a picture to satisfy a number is
       the thing this file's own comments warn against. */
    parapet: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0"/>
      <stop offset="64%"  stop-color="${ink}" stop-opacity="0"/>
      <stop offset="82%"  stop-color="${ink}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.55"/>`,

    top: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0.92"/>
      <stop offset="34%"  stop-color="${ink}" stop-opacity="0.55"/>
      <stop offset="62%"  stop-color="${ink}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.10"/>`,
  }[kind];

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
       <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>
       <rect width="${w}" height="${h}" fill="url(#s)"/>
     </svg>`,
  );
}

/* ---------- CUT-OUT -----------------------------------------
   A building on white, turned into a building on nothing.

   The supplied artwork comes back from the generator on a near-white
   ground — 254,254,254 — not on transparency. Our paper is #FDFDFB.
   Those two are indistinguishable on screen and identical in CMYK
   (both are simply no ink), so it is tempting to leave it. Do not:
   the moment the page behind it is anything but that exact white —
   a tinted panel, a dark page, next year's cover — a pale rectangle
   appears around the building. Cut it out once, properly, and the
   artwork works anywhere.

   WHY FLOOD FILL AND NOT A THRESHOLD. A threshold says "every pixel
   brighter than X is background". That is wrong here: these towers
   are glass and steel, their highlights and their white podiums go
   brighter than the ground does, and a threshold punches holes
   straight through them. A flood fill from the border only removes
   background that is CONNECTED to the outside, so an enclosed
   highlight stays exactly where it is.

   The edge then needs two more passes. Generated cut-outs have a
   1-3px anti-aliased fringe carrying the old background colour, so
   the mask is grown one pixel inward to eat it, and the alpha is
   blurred very slightly so the result does not look scissored. */

/* THE MASK COMES FROM THE UNGRADED PIXELS, and the reason is
   narrower than it first looked.

   It is NOT that grading breaks the fill. That was the first
   theory and it is wrong - measured both ways, the fill is stable
   either side of the grade, and on graded pixels it is marginally
   more stable, because the grade clips the near-white ground to a
   flat 255:

     ungraded   BG244 31.2%   BG248 31.3%   BG250 31.5%   BG252 32.0%
     graded     BG244 31.2%   BG248 31.2%   BG250 31.2%   BG252 31.2%

   The real reason is the alpha channel. sharp's linear() scales
   every channel it is given, alpha included, so once the cut-out
   exists the grade can no longer be applied to the whole image
   without quietly re-opening the background. Masking first, then
   grading the COLOUR ONLY and joining the alpha afterwards, means
   linear() never sees an alpha channel at all.
   ---------------------------------------------------------- */
/* ---------- DUOTONE ------------------------------------------
   The cover photograph stops being a photograph.

   It is an AI render: flat-on, no light, no point of view. As a
   picture it cannot carry a cover, and no amount of layout around
   it fixed that over six attempts. But the client asked for Dubai
   buildings on the front and they are right to - so the buildings
   stay and the PHOTOGRAPH goes. Mapped onto the brand's own
   colours it reads as a designed mark rather than as stock
   imagery, and a weak photograph makes a perfectly good graphic.

   It also retires a blocker that had been open for days: the
   source is 768px, which is about 230dpi at this size and too soft
   to print as a photograph. A tonal silhouette does not carry that
   kind of detail in the first place, so the softness stops
   mattering.

   THE RAMP IS DELIBERATELY BOTTOM-HEAVY. Most of the tonal range
   lands in navy and only the brightest edges reach teal. An even
   ramp across the full palette is what makes a duotone look like a
   cheap poster; keeping it dark keeps it quiet. */
/* THE FIRST RAMP GLOWED, and it is worth recording why, because the
   reasoning behind it was sound and the result was still wrong.

   It ended on --mint and reached it at t=0.80. On a photograph of a
   city that is a reasonable place to put the top stop. On a
   photograph of THESE towers it is not: their facades are horizontal
   mullions - thousands of thin bright lines - and almost every one
   of them landed in that top fifth. So the ramp lit every floor edge
   in mint and the skyline came out as a CAD wireframe: a sci-fi
   city, which is the exact register a holding company must not be in.

   Two changes, and both were needed.

   GAMMA. t is raised to 1.55 before it is mapped, which pushes the
   mid and upper tones down the ramp. Only genuinely bright edges
   reach the top stop now, instead of every mullion.

   THE TOP STOP IS NO LONGER MINT. It is a desaturated teal-slate.
   Mint is a 222-green accent built to sit on navy as TYPE, a few
   glyphs at a time; spread across half a skyline it is a neon sign.

   What is left is architecture emerging from night: the shadows sit
   ON --ink, so the building grows out of the ground instead of being
   pasted onto it, and the lift at the top is just enough to read as
   glass. */
const DUOTONE = [
  [0.00, [12,  24,  37]],  // a hair above --ink, so shadow merges into the page
  [0.62, [23,  45,  66]],  // --ink-panel, roughly
  [0.88, [40,  84,  99]],  // cool slate - still dark
  [1.00, [93, 160, 165]],  // muted teal-grey. NOT --mint.
];

/* Bends the input tone curve down before mapping. Above 1 the
   picture darkens. Measured on the render, not guessed. */
const DUOTONE_GAMMA = 1.55;

function duotone(rgb, w, h) {
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const lum = (rgb[i * 3] * 0.299 + rgb[i * 3 + 1] * 0.587 + rgb[i * 3 + 2] * 0.114) / 255;
    const t = Math.pow(lum, DUOTONE_GAMMA);
    let k = 0;
    while (k < DUOTONE.length - 2 && t > DUOTONE[k + 1][0]) k++;
    const [t0, c0] = DUOTONE[k];
    const [t1, c1] = DUOTONE[k + 1];
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = Math.round(c0[ch] + (c1[ch] - c0[ch]) * f);
  }
  return out;
}

const BG_MIN = 248;          // anywhere in 240-253 gives the same mask
const FEATHER = 0.7;         // px of alpha blur; above ~1.2 the edge goes soapy

async function cutOut(src, asDuotone) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;

  /* 1. Flood fill from every border pixel. An explicit stack, not
        recursion: 1.5M pixels overflows the call stack. */
  const bg = new Uint8Array(w * h);
  const stack = [];
  const bright = (i) => data[i * c] >= BG_MIN && data[i * c + 1] >= BG_MIN && data[i * c + 2] >= BG_MIN;
  const push = (i) => { if (!bg[i] && bright(i)) { bg[i] = 1; stack.push(i); } };

  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }

  /* 2. Grow the background one pixel inward, to eat the fringe. */
  const grown = Uint8Array.from(bg);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (bg[i]) continue;
      if (bg[i - 1] || bg[i + 1] || bg[i - w] || bg[i + w]) grown[i] = 1;
    }
  }

  /* 3. Alpha, the artwork's bounding box, and the RGB to grade.

        The box is computed here rather than left to sharp's .trim(),
        which was tried and is wrong for this job: trim matches
        against the TOP-LEFT PIXEL COLOUR, and the top-left pixel is
        the old white ground — so it trimmed away every pale part of
        the towers too and returned a 41x53 crop of the darkest
        corner. We already know which pixels are artwork. */
  const alpha = Buffer.alloc(w * h);
  const rgb = Buffer.alloc(w * h * 3);
  let kept = 0;
  let minX = w, maxX = -1, minY = h, maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      rgb[i * 3] = data[i * c];
      rgb[i * 3 + 1] = data[i * c + 1];
      rgb[i * 3 + 2] = data[i * c + 2];
      if (grown[i]) { alpha[i] = 0; continue; }
      alpha[i] = 255;
      kept++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error('cut-out removed the entire image - BG_MIN is wrong for this artwork');

  /* One pixel of margin so the feathered edge is not itself clipped. */
  const box = {
    left: Math.max(0, minX - 1),
    top: Math.max(0, minY - 1),
    width: Math.min(w, maxX + 2) - Math.max(0, minX - 1),
    height: Math.min(h, maxY + 2) - Math.max(0, minY - 1),
  };

  /* toColourspace('b-w') is load bearing, and the reason cost an
     hour. sharp's blur() PROMOTES a one-channel raw input to three
     channels: the buffer comes back at w*h*3 rather than w*h. If it
     is then handed to joinChannel as one channel per pixel, the
     alpha reads a third of the way across each row and lands
     misaligned against the colour — which renders as the buildings
     shredded into horizontal stripes with the background showing
     through them.

     That looks exactly like a mask that ate the artwork, which is
     what sent two attempts at this chasing the fill threshold and
     the grading order. The mask was correct the whole time. When a
     cut-out comes out striped, measure the buffer length before
     touching anything else. */
  const softAlpha = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .blur(FEATHER)
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  if (softAlpha.length !== w * h) {
    throw new Error();
  }

  /* Grade the COLOUR only. linear() applied to an image that already
     carries alpha would scale the alpha channel with everything
     else, which quietly re-opens the background. */
  let graded = await gradeR(sharp(rgb, { raw: { width: w, height: h, channels: 3 } }))
    .raw()
    .toBuffer();

  if (asDuotone) graded = duotone(graded, w, h);

  const img = sharp(graded, { raw: { width: w, height: h, channels: 3 } })
    .joinChannel(softAlpha, { raw: { width: w, height: h, channels: 1 } });

  /* A sanity number worth printing: if the fill ate the building
     the coverage collapses, and that is easier to see here than to
     discover later on a page. */
  const pct = ((kept / (w * h)) * 100).toFixed(1);

  return { img, pct, box };
}

function findRaw(slug) {
  const hit = readdirSync(RAW).find((f) => f.replace(/\.[^.]+$/, '') === slug);
  return hit ? resolve(RAW, hit) : null;
}

const wanted = process.argv.slice(2);
const slugs = Object.keys(PLAN).filter((s) => !wanted.length || wanted.includes(s));

for (const slug of slugs) {
  const src = findRaw(slug);
  if (!src) {
    console.log('-  ' + slug + ' - no raw file, skipping');
    continue;
  }

  const spec = PLAN[slug];
  const box = BOXES[spec.box];
  let cutReport = null;

  for (const dpi of [300, 150]) {
    const w = MM(box.w, dpi);
    const h = MM(box.h, dpi);

    /* .rotate() with no argument applies the file's EXIF
       orientation. It has to come before extract(), because a
       phone photograph stores its pixels landscape and flags the
       rotation - crop first and you cut the wrong axis. */
    let img = sharp(src);
    if (spec.rotate) img = img.rotate();
    if (spec.extract) img = img.extract(spec.extract);

    if (spec.cutout) {
      /* Grade BEFORE cutting: the grade lifts the near-white ground
         to a flat 255, which makes the fill cleaner. Then trim the
         empty margin, so the file's aspect is the artwork's aspect
         and the page can place it without guessing.

         fit: 'inside' + withoutEnlargement, never 'cover'. A cut-out
         must not be cropped - a tower with its spire cut off is not
         a cut-out, it is a mistake - and it must not be blown up,
         because upscaling keeps every bit of the softness and adds
         file size for it. */
      const cut = await cutOut(src, spec.duotone);
      cutReport = cut.pct;
      img = sharp(await cut.img.png().toBuffer())
        .extract(cut.box)
        .resize(w, h, { fit: 'inside', withoutEnlargement: true });

      const out = resolve(OUT, slug + '@' + dpi + '.png');
      await img.png({ compressionLevel: 9 }).toFile(out);
      continue;
    }

    img = img.resize(w, h, { fit: 'cover', position: spec.focus ?? 'centre' });
    img = spec.grade === 'H' ? gradeH(img) : gradeR(img);

    if (spec.scrim) {
      img = img.composite([{ input: scrimSVG(spec.scrim, w, h), blend: 'over' }]);
    }

    const out = resolve(OUT, slug + '@' + dpi + '.jpg');
    await img
      .jpeg({ quality: dpi === 300 ? 92 : 80, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toFile(out);
  }

  /* A rotated file reports its STORED dimensions, which are the
     wrong way round. Swap them so the resolution report below
     talks about the frame the page will actually show. */
  const raw = await sharp(src).metadata();
  const turned = spec.rotate && (raw.orientation === 6 || raw.orientation === 8);
  const meta = turned ? { ...raw, width: raw.height, height: raw.width } : raw;
  const w300 = MM(box.w, 300);
  const enough = meta.width >= w300 * 0.9;
  if (cutReport !== null) {
    console.log('   cut-out: ' + cutReport + '% of the frame kept as artwork');
  }
  console.log(
    (enough ? 'OK ' : '!  ') +
      slug.padEnd(22) +
      ('grade ' + spec.grade + (spec.scrim ? '/' + spec.scrim : '')).padEnd(16) +
      (w300 + 'px wide from ' + meta.width + 'px source') +
      (enough ? '' : '  <- source is thin for this placement'),
  );
}

/* ---------- logo cleanup ------------------------------------
   The supplied transparent PNG has a 1-3px fully opaque frame
   baked around its edge. On a photograph that frame renders as a
   faint rectangle floating around the mark, which is exactly the
   kind of detail that makes a cover look homemade. Crop the frame
   off, then trim the surrounding transparency so the mark sits
   tight in its own box and can be sized by width alone. */
{
  const src = resolve(ROOT, 'brand/logo-transparent.png');
  const out = resolve(ROOT, 'brand/logo-mark.png');

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const alpha = (x, y) => data[(y * w + x) * c + 3];

  /* Walk in from each edge past any row or column that is almost
     entirely opaque — that is the frame, not the artwork. */
  const rowSolid = (y) => { let n = 0; for (let x = 0; x < w; x++) if (alpha(x, y) > 40) n++; return n / w > 0.9; };
  const colSolid = (x) => { let n = 0; for (let y = 0; y < h; y++) if (alpha(x, y) > 40) n++; return n / h > 0.9; };
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < h && rowSolid(top)) top++;
  while (bottom > top && rowSolid(bottom)) bottom--;
  while (left < w && colSolid(left)) left++;
  while (right > left && colSolid(right)) right--;

  /* Then take the true bounding box of the mark inside it, so the
     PNG can be placed by width alone with no invisible padding
     throwing the optical centring off. */
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (alpha(x, y) > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  await sharp(src)
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png()
    .toFile(out);

  console.log(
    'OK logo-mark.png          frame ' + top + 'px removed, cropped to artwork ' +
      (x1 - x0 + 1) + 'x' + (y1 - y0 + 1),
  );
}

/* ---------- monogram ----------------------------------------
   The full lockup is mark + "BH VENTURES" + "FZE - LLC". Used as
   a large background watermark it gets cropped by the page edge,
   and a half-cut wordmark reads as a printing mistake rather than
   as a graphic. The monogram alone crops cleanly at any size, so
   it is split out as its own asset.

   The split is found, not hard-coded: scan for horizontal bands
   of content and keep the first one. */
{
  const src = resolve(ROOT, 'brand/logo-mark.png');
  const out = resolve(ROOT, 'brand/logo-monogram.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const rowHas = (y) => {
    for (let x = 0; x < w; x++) if (data[(y * w + x) * ch + 3] > 8) return true;
    return false;
  };

  let end = 0;
  while (end < h && rowHas(end)) end++;   // first band ends at the first blank row

  let x0 = w, x1 = -1;
  for (let y = 0; y < end; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * ch + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }

  await sharp(src)
    .extract({ left: x0, top: 0, width: x1 - x0 + 1, height: end })
    .png()
    .toFile(out);

  console.log('OK logo-monogram.png      mark only, ' + (x1 - x0 + 1) + 'x' + end);
}

/* ---------- wordmark ----------------------------------------
   The cover masthead: "BH VENTURES" on its own, without the
   monogram above it or "FZE - LLC" below.

   A masthead has to be WIDE and SHORT. The full lockup is stacked
   three bands deep, so setting it 150mm across makes it 118mm
   tall and there is no cover left. The wordmark alone at the same
   width is about 20mm, which is what a masthead wants.

   Same band scan as the monogram above, one band further down.
   The bands are found rather than hard-coded, so a redrawn logo
   with different proportions still splits correctly. */
{
  const src = resolve(ROOT, 'brand/logo-mark.png');
  const out = resolve(ROOT, 'brand/logo-wordmark.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const rowHas = (y) => {
    for (let x = 0; x < w; x++) if (data[(y * w + x) * ch + 3] > 8) return true;
    return false;
  };

  /* Every horizontal band of content, top to bottom. */
  const bands = [];
  let y = 0;
  while (y < h) {
    while (y < h && !rowHas(y)) y++;
    if (y >= h) break;
    const top = y;
    while (y < h && rowHas(y)) y++;
    bands.push({ top, height: y - top });
  }

  if (bands.length < 2) {
    console.log('!  logo-wordmark.png       only ' + bands.length + ' band(s) found - skipping');
  } else {
    const band = bands[1];
    let x0 = w, x1 = -1;
    for (let yy = band.top; yy < band.top + band.height; yy++) {
      for (let x = 0; x < w; x++) {
        if (data[(yy * w + x) * ch + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
        }
      }
    }

    await sharp(src)
      .extract({ left: x0, top: band.top, width: x1 - x0 + 1, height: band.height })
      .png()
      .toFile(out);

    console.log('OK logo-wordmark.png      band 2 of ' + bands.length + ', ' +
      (x1 - x0 + 1) + 'x' + band.height);
  }
}

/* ---------- horizontal lockup -------------------------------
   The cover masthead: the mark beside the wordmark instead of
   above it.

   WHY IT IS REARRANGED. The supplied lockup is stacked three
   bands deep and its aspect is 1.288, so at the 156mm width a
   masthead wants it stands 121mm tall and there is no cover left
   under it. Set small enough to fit, the logo stops being
   prominent, which is the one thing the client asked for. Beside
   each other, the same two pieces are 6:1 and 25mm tall at full
   measure - a masthead.

   Nothing inside either piece is altered. The mark is the mark
   and the wordmark is the wordmark; only the space between them
   changes. Both come from logo-mark.png, so the wordmark is
   already navy and the ground is already transparent - the navy
   block in the supplied logo-navy.jpg never reaches a page.

   THE THREE PROPORTIONS, and they are the whole job:
     mark height   1.8x the wordmark. Lower and the mark reads as
                   an afterthought; higher and it bullies the name.
     gap           0.45x the wordmark height. Tighter and they
                   fuse into one shape; wider and they read as two
                   unrelated objects.
     vertical      centred on the mark, then nudged up 2% - type
                   sits optically low against a solid form because
                   its descenders are mostly empty space. */
{
  const markSrc = resolve(ROOT, 'brand/logo-monogram.png');
  const wordSrc = resolve(ROOT, 'brand/logo-wordmark.png');
  const out = resolve(ROOT, 'brand/logo-lockup.png');

  const word = await sharp(wordSrc).metadata();
  const mark = await sharp(markSrc).metadata();

  const markH = Math.round(word.height * 1.8);
  const markW = Math.round(markH * (mark.width / mark.height));
  const gap = Math.round(word.height * 0.45);

  const W = markW + gap + word.width;
  const H = markH;
  const wordTop = Math.round((H - word.height) / 2 - H * 0.02);

  const markBuf = await sharp(markSrc).resize(markW, markH).png().toBuffer();

  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: markBuf, left: 0, top: 0 },
      { input: wordSrc, left: markW + gap, top: wordTop },
    ])
    .png()
    .toFile(out);

  console.log('OK logo-lockup.png        ' + W + 'x' + H +
    '  (mark ' + markW + 'x' + markH + ', gap ' + gap + ', aspect ' + (W / H).toFixed(2) + ')');
}

/* ---------- the lockup for dark ground ----------------------
   The cover is now one navy field from edge to edge, and the
   supplied logo is navy type with a teal mark. Placed on that
   field the wordmark simply disappears - the client asked for one
   thing about this logo, that it be PROMINENT, and navy on navy is
   the least prominent a mark can be.

   So it is reversed rather than moved. Nothing about the drawing
   changes; only which two colours it is drawn in.

   The split is made on hue, not on lightness. Lightness cannot
   tell the teal mark from the navy letters - both are mid-dark -
   but the mark is the only part of the artwork where green leads
   red, and it leads it by a wide margin. Everything green-led
   becomes --mint, everything else --paper.

   Alpha is carried through untouched, so the edges stay as
   antialiased as the original. */
{
  const src = resolve(ROOT, 'brand/logo-lockup.png');
  const out = resolve(ROOT, 'brand/logo-lockup-light.png');

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  const MINT = [97, 222, 206];
  const PAPER = [253, 253, 251];
  const GREEN_LEAD = 25;   // r->g margin that separates mark from wordmark

  let marked = 0;
  const px = Buffer.from(data);
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] === 0) continue;
    const isMark = px[i * 4 + 1] - px[i * 4] > GREEN_LEAD;
    const c = isMark ? MINT : PAPER;
    if (isMark) marked++;
    px[i * 4] = c[0];
    px[i * 4 + 1] = c[1];
    px[i * 4 + 2] = c[2];
  }

  await sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toFile(out);

  /* If the hue split found nothing the whole logo just went white,
     and a white-on-navy lockup with no mark is a caption. Say so
     here rather than let it print. */
  const pct = ((marked / (w * h)) * 100).toFixed(1);
  if (marked === 0) console.log('!  logo-lockup-light.png  hue split found no mark - logo is flat white');
  else console.log('OK logo-lockup-light.png  ' + w + 'x' + h + ', mark is ' + pct + '% of the box');
}

/* ---------- ghosted monogram --------------------------------
   The watermark inside the navy panel on the cover: the mark,
   flat white, at about nine percent.

   BAKED, not set in CSS. An element with opacity below 1 becomes
   its own transparency group in the PDF, and this book went from
   138 of those to 16 by getting rid of exactly that. A flat PNG
   alpha is a different construct - one /SMask on the image, which
   is the one form of transparency verify-pdf has always accepted,
   because it is what the logo has always used.

   White rather than the mark colour: on navy the teal gradient
   turns to mud at nine percent, and a watermark is a texture, not
   a logo placement. */
{
  const src = resolve(ROOT, 'brand/logo-monogram.png');
  const out = resolve(ROOT, 'brand/logo-monogram-ghost.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 250;
    rgba[i * 4 + 1] = 250;
    rgba[i * 4 + 2] = 248;
    rgba[i * 4 + 3] = Math.round(data[i * ch + 3] * 0.09);
  }

  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(out);
  console.log('OK logo-monogram-ghost.png  white at 9%, ' + w + 'x' + h);
}

/* ---------- the same mark, for PAPER --------------------------
   The ghost above is white at 9% and only works on navy. Page 2
   is a light page and wanted the mark behind its statement, so
   this is its opposite: the ink colour at 7%.

   Seven rather than nine. A dark wash on paper reads stronger
   than a light one on navy at the same number - the eye has more
   contrast to work with - and at 9% it stopped being a texture
   and started being a logo someone had left on the page.

   Baked, for the same reason as the ghost: opacity below 1 in CSS
   becomes its own transparency group in the PDF, and this book
   went from 138 of those to 16 by removing exactly that. */
{
  const src = resolve(ROOT, 'brand/logo-monogram.png');
  const out = resolve(ROOT, 'brand/logo-monogram-wash.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = 0x0e;
    rgba[i * 4 + 1] = 0x1b;
    rgba[i * 4 + 2] = 0x2b;
    rgba[i * 4 + 3] = Math.round(data[i * ch + 3] * 0.07);
  }

  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(out);
  console.log('OK logo-monogram-wash.png   ink at 7%, ' + w + 'x' + h);
}

/* ---------- the lockup, without its box ---------------------
   The client wants the cover lockup exactly as it is but with the
   navy rectangle behind it gone. That needs an asset neither
   supplied file is: a WHITE wordmark on a TRANSPARENT ground.

   The two files are a light/dark pair and between them they have
   both halves —

     logo-transparent.png   transparent ground, NAVY wordmark
     logo-navy.jpg          navy ground,        WHITE wordmark

   — and they are the same artwork at the same size, measured at
   99.6% pixel alignment. So the alpha is taken from the PNG and
   the colour from the JPG.

   This is deliberately not a colour-key of the JPEG. Keying a
   lossy file leaves navy on every anti-aliased edge, and on a
   photograph that fringe reads as a halo around the mark. The
   PNG's alpha is already clean, so borrowing it avoids the
   problem rather than trying to clean up after it. */
{
  const png = resolve(ROOT, 'brand/logo-transparent.png');
  const jpg = resolve(ROOT, 'brand/logo-navy.jpg');
  const out = resolve(ROOT, 'brand/logo-white.png');

  const a = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(jpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    throw new Error('logo files differ in size; cannot borrow the alpha channel');
  }

  const { width: w, height: h } = a.info;
  const ca = a.info.channels;
  const cb = b.info.channels;
  const rgba = Buffer.alloc(w * h * 4);

  /* Measure the JPG's background from a corner block rather than
     assuming it, so the un-blend below uses the file's real value. */
  let br = 0, bg = 0, bb = 0, n = 0;
  for (let y = 6; y < 26; y++) {
    for (let x = 6; x < 26; x++) {
      const i = (y * w + x) * cb;
      br += b.data[i]; bg += b.data[i + 1]; bb += b.data[i + 2]; n++;
    }
  }
  const BG = [br / n, bg / n, bb / n];

  /* Straight compositing would carry a navy halo. The JPG's edge
     pixels are already blended against its navy ground, so pairing
     that colour with partial alpha paints navy fringe onto whatever
     is behind the mark — measured at 91% of edge pixels on the
     first attempt, and on a photograph it reads as a glow.

     Undo the blend instead. The observed colour is
        C = a*F + (1-a)*B
     so the true foreground is
        F = (C - (1-a)*B) / a
     which is exact wherever alpha is meaningful. */
  for (let i = 0; i < w * h; i++) {
    const alpha = a.data[i * ca + 3];
    const t = alpha / 255;
    for (let k = 0; k < 3; k++) {
      const C = b.data[i * cb + k];
      const F = t > 0.02 ? (C - (1 - t) * BG[k]) / t : C;
      rgba[i * 4 + k] = Math.max(0, Math.min(255, Math.round(F)));
    }
    rgba[i * 4 + 3] = alpha;
  }

  /* The supplied PNG has a 1-3px fully opaque frame baked around
     its edge, so a naive bounding box is the whole image. Walk in
     past any row or column that is almost entirely opaque — that is
     the frame — and only then find the artwork. */
  const alphaAt = (x, y) => rgba[(y * w + x) * 4 + 3];
  const rowSolid = (y) => { let n = 0; for (let x = 0; x < w; x++) if (alphaAt(x, y) > 40) n++; return n / w > 0.9; };
  const colSolid = (x) => { let n = 0; for (let y = 0; y < h; y++) if (alphaAt(x, y) > 40) n++; return n / h > 0.9; };

  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < h && rowSolid(top)) top++;
  while (bottom > top && rowSolid(bottom)) bottom--;
  while (left < w && colSolid(left)) left++;
  while (right > left && colSolid(right)) right--;

  /* Clear the frame so it cannot reappear as a hairline on the page. */
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < top || y > bottom || x < left || x > right) rgba[(y * w + x) * 4 + 3] = 0;
    }
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (alphaAt(x, y) > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png()
    .toFile(out);

  console.log('OK logo-white.png         white wordmark on transparent, ' + (x1 - x0 + 1) + 'x' + (y1 - y0 + 1));
}
