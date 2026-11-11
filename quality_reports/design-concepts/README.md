# Design concepts: On se retrouve (2026-11-11)

These are three design directions for the result screen. They are static mockups, not fixes: the incremental fixes are in `../2026-11-11_design-diagnostic.md`. No source file was touched. Open `index.html` to compare them side by side.

| File | What it is |
|---|---|
| `concept-a.html` | A. Carnet de route: answer first, editorial type, each group's trip shown as a ticket |
| `concept-b.html` | B. Carte d'abord: full-screen map with ranking chips, side panel on desktop, bottom sheet on phone |
| `concept-c.html` | C. Pas à pas: three questions, big controls, sentences instead of tables |
| `index.html` | One-paragraph pitch per concept, with thumbnails |
| `shots/` | Screenshots per concept at 1440 px and 390 px (full page), a 390 px first screen (`-fold`) and a 390 px dark-mode capture (`-dark`). B also has `concept-b-1440-full.png` |

**Content used.** Every figure comes from the app's 11/11/2026 run shown in `../../.playwright-mcp/*.jpeg`: Paris wins at 2 h 10, mean 1 h 20; Bourges 3 h 55, Tours 4 h 02, Orléans 4 h 15, Lyon 4 h 22. Group 2 travels from Lyon on TGV INOUI 6622 and 6665 for 51–230 € return. The headcounts (2, 1 and 3) follow from the fares: 204–1 010 € for 6 people is 34–168 € each. The "≥" cue sits where the app already prints it (Bourges, Orléans). Group names are the neutral "Groupe 1/2/3".

**Shared floor, checked in the browser.** All three share the same baseline:
- Light and dark mode through CSS variables. Each page follows `prefers-color-scheme`, and `data-theme` can override it.
- Every HTML control is at least 44 px tall; C uses 52–60 px. This was measured with `getBoundingClientRect` at 390 px. The exception is B's map chips: they are SVG labels (about 30 px tall at 1440 px, about 20 px at 390 px), not controls. B's caption therefore points to the list as the way to choose a city.
- No horizontal scroll at 390 px.
- Text contrast passes WCAG AA in both themes (computed for every text/background token pair). The only pair under 3:1 is A's decorative card hairline, which carries no meaning; input borders use the stronger ink tone.
- Narrow no-break space before `:`, `;` and `?`. Durations are written `2 h 10` with no-break spaces.
- The honesty cues stay: theoretical SNCF timetables with their GTFS date, full-fare ranges, "≥" for unpublished TER fares, km × 0,35 €, IGN road times, and crow-flies map lines.

---

## The three directions

### A. Carnet de route (travel document)
- **Idea.** The page reads like the trip papers you would print and hand out. The answer is the headline ("Rendez-vous à Paris."), followed by three figures (longest trip, mean, total cost). Each group gets a ticket: the outbound and return legs with times in the display serif, then stations, train number and fare, with the group cost on a perforated stub. The ranking runs alongside. The trip form ("Votre voyage") and the "Conditions du calcul" come last, like the conditions printed on the back of a ticket.
- **Look.** Pale green-grey ticket-stock paper. Blue-black ink, and one accent, stamp red, used on the city name and the leg labels. Newsreader (upright) for display, Public Sans for text, tabular figures throughout.
- **Serves best:** the person who organises the weekend and forwards the result, and anyone reading on a laptop or tablet. It also works well on a phone, because the answer and the map fit the first screen (`shots/concept-a-390-fold.png`).
- **What changes in the app.** The structure barely changes: it stays one page. The sidebar goes and the inputs move below the result, reached through "Modifier le voyage" in the masthead. The detail table becomes ticket cards at every width, which removes the phone table problem (diagnostic finding 2) by construction. The scenario tabs (Voiture / Train / Tous les scénarios) would sit as a quiet segmented control under the headline.
- **Effort: M.** Files touched:
  - `src/App.tsx`: reorder the JSX and add the answer block and ticket markup.
  - `src/globals.css`: rewrite the tokens and layout, about 70 dense lines today.
  - `src/travel-map.tsx`: classes for routes and labels.
  - The `components/ui/table.tsx` usage for the detail table is dropped.
  - Two self-hosted fonts, added to `public/fonts/`.
  - Engine, data and tests are untouched.
- **Risks.**
  - The serif and paper look can feel "designed" to some relatives. It is the most opinionated of the three visually, but the least risky structurally.
  - With 6 or more groups the tickets get long, so all but the selected group need to collapse to one line, as Groupe 3 does in the mockup.

### B. Carte d'abord (map first)
- **Idea.** The map is the interface. Every compared city carries a chip showing its rank and longest trip, with the winner's chip in road-map yellow. Lines run from each departure to the selected city and are labelled with the duration. On desktop, the result (answer, ranking, group-by-group timeline) is a fixed side panel and the trip form floats over the sea. On a phone the map comes first and the result is a bottom sheet pulled up over it, followed by the form.
- **Look.** Cartographic neutrals (sea, land, region borders). One accent, yellow, always used as a fill under dark text, never as text colour. Barlow Semi Condensed, a signage-style face, for figures and labels; Barlow for text.
- **Serves best:** the curious family member on a desktop who wants to see why Paris wins and explore the alternatives spatially.
- **What changes in the app.** It is the biggest structural shift on desktop: a full-height layout with a sticky map, a side panel and a floating form. The map stops being an illustration and becomes the main control, so selecting a chip drives the panel.
- **Effort: L.** Files touched:
  - `src/travel-map.tsx` grows from 12 lines to a real component, with chips, duration labels, selection and a label-placement rule.
  - `src/App.tsx`: new shell (map column plus panel), and the sheet on phone.
  - `src/globals.css`: new layout.
  - Possibly a small label-collision helper in `lib/`.
- **Risks (the main reason it is not recommended).**
  - **Label collisions.** The mockup's chips are hand-placed. With 20 central-France cities clustered around Bourges, Nevers and Moulins, chips overlap as soon as the user changes the destinations. Production needs a placement algorithm, or chips for the top 5 only.
  - **Phone legibility and touch targets.** On a 390 px phone the map renders at about 0.65 scale: chips are about 20 px tall (about 30 px even at 1440 px). They cannot be the touch control, so the mockup presents them as labels and the list stays the real control. Making the chips tappable would mean HTML chips over the map, sized at 44 px, which makes collisions worse. This brings back diagnostic finding 9.
  - **The map can mislead.** It invites "distance" reading, yet the lines are crow-flies and the ranking is by train or car time.
  - A real draggable sheet needs pointer handling. The mockup uses a static overlap.

### C. Pas à pas (step by step, for older relatives)
- **Idea.** Three questions with plain-language answers:
  1. Qui part ? Each group gets a town field, a one-tap Train / Voiture / Les deux control, and − / + for headcount.
  2. Quand ? Three week-end cards ("Ce week-end", "Le week-end suivant", "D'autres dates") plus two times.
  3. Où se retrouver ? The answer is a sentence: "À Paris. Personne n'a plus de 2 h 10 de train." One line per group follows, then that group's trains spelled out ("Départ 15:04, Lyon Part-Dieu"), the price as "51 à 230 €" and a single "Vérifier et réserver" button.

  The other choices, the map and "Bon à savoir" come after. On desktop, the answered questions stay editable in a left column. On a phone the result comes first, and the answers follow below it.
- **Look.** Cool white with a pine-green accent. One family, Atkinson Hyperlegible Next, which was designed for low-vision readers. Base text is 19 px and every control is 52–60 px tall.
- **Serves best:** the stated audience: non-technical relatives, often older, on phones. It is also the only concept where someone can fill in the form without understanding "scénario", "€/km" or "GTFS".
- **What changes in the app.**
  - The interaction model changes. A step state machine is added (1 → 2 → 3, with back navigation), along with per-step validation and a "Calcul en cours : 38 trajets sur 100" screen between steps 2 and 3. The run can take about 2.5 min when IGN is slow, so this screen matters.
  - The week-end picker computes the next two Fridays.
  - The cost-per-km field and the scenario tabs move behind an "Options" disclosure on step 3.
  - The share link ("Envoyer à la famille") must restore straight to step 3.
- **Effort: L.** Files touched:
  - `src/App.tsx`: step state and a split into step components, which probably means 3 new files under `src/`.
  - `src/globals.css`.
  - New small UI pieces: segmented control and counter. Native radios cover most of it.
  - The engine is untouched.
- **Risks.**
  - Power users lose the at-a-glance comparison, so step 3 must keep a route to the scenario comparison.
  - Wizards annoy people who already know what they want, so a returning visitor with a share link should land on step 3.
  - It is the largest rewrite of `App.tsx`, which another engineer is currently editing.

---

## Comparison

| | A. Carnet de route | B. Carte d'abord | C. Pas à pas |
|---|---|---|---|
| Answer in 3 s on a phone | Yes, first screen | Yes, sheet on first screen | Yes, first screen |
| Older relatives filling the form | OK | Weak (dense floating form) | Best |
| Train-by-train detail on phone | Very good (tickets) | Good (timeline) | Very good (sentences) |
| Map role | Illustration | The main control | Illustration |
| Structural change | Low | High | High (interaction model) |
| Effort | M | L | L |
| Main risk | Taste: paper and serif may feel formal | Label collisions, phone legibility | Wizard friction for power users |

## Recommendation

**Build A, and borrow C's input controls and wording for the trip form.**

- A fixes what the diagnostic found broken without changing how the app works:
  - The answer comes first.
  - Tickets replace the table that fails on phones.
  - There is one accent and real tokens for dark mode.
  - The structure stays one page.
  - It is an M-sized change, mostly confined to `App.tsx` JSX and `globals.css`. That matters while `src/` is being edited in parallel.
- C's best ideas fit inside A's "Votre voyage" section with no wizard:
  - the one-tap transport control instead of a select;
  - − / + for headcount;
  - "Ce week-end / Le week-end suivant" cards instead of two date pickers;
  - plain sentences for each group's trains.

  Together these give older relatives most of C's ease at a fraction of C's cost. Run the full wizard later as an experiment, once A ships, if relatives still struggle with the form.
- Keep B's map chips as a later S-sized enhancement to A's map plate, limited to the top 5 cities to avoid collisions. Do not make the map the primary control: on a phone it cannot meet 44 px targets.

## Notes on method

- **Inferred brief** (Hallmark's three questions, answered from the task because there was no one to ask):
  - Audience: non-technical family members of all ages, often on phones.
  - Use: get one meeting city and each person's train.
  - Tone: A editorial, B utilitarian-cartographic, C soft and plain.
- **Skills used as lenses:** `hallmark`, `design-taste-frontend`, `redesign-existing-projects`, `high-end-visual-design`, `minimalist-ui`, `frontend-design` and `industrial-brutalist-ui`.
  - From them I kept: one accent per concept, tokenised colour, no default font, no eyebrow labels, no 01/02/03 on non-sequences, no em dashes, roman headings, honest content, mobile collapse declared per component, and dark mode.
  - I deliberately did not follow:
    - the marketing-page prescriptions (scroll reveals, double-bezel cards, `py-24` sections, stock photography), because this is a utility;
    - industrial-brutalist, which served only as a contrast reference for B's signage type and hard map chips.
  - Where the brief and a skill disagree, the brief won:
    - The map is a hand-simplified SVG, not "decorative": it is the app's own `public/france-regions.geojson`, projected with the app's formula.
    - Numeric ranges keep the en dash (`25,5–115 €`), which is French typographic convention.
    - A uses a serif because the brief asks for a travel document. Its paper is a cool green-grey, not the cream/terracotta default.
    - The map chips in B use one middle dot each ("2 · 3 h 55").
- **Fonts.** The mockups load Google Fonts and fall back to system stacks. For production, self-host them: GitHub Pages is static, and loading Google Fonts sends visitors' IP addresses to Google, which is a GDPR concern in the EU.
- **Not mocked:** loading, IGN-outage, empty and invalid-date states. Each concept has an obvious slot for them: A under the headline, B at the top of the sheet, C as a step-3 interstitial.
