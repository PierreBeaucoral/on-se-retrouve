# Design diagnostic: On se retrouve (2026-11-11)

Read-only audit. No source file was modified. Screenshots: `quality_reports/design-screens/` (prefixed `NN-`, cited below as `[NN]`).
Skills applied: `hallmark` (audit mode), `redesign-existing-projects`, `design-taste-frontend`, `high-end-visual-design`, `minimalist-ui`, `frontend-design:frontend-design`. All six loaded.

**How the skills were weighed.** `design-taste-frontend` declares dense product UI and data tables out of scope (its section 13). `high-end-visual-design` (double-bezel cards, `py-24` sections, scroll-reveal on everything) and `minimalist-ui` (ambient blobs, fade-in entries) are written for marketing pages. Those prescriptions are deliberately **not** recommended here: this is a family utility whose job is one answer, read on a phone. What I kept from them is the cross-skill consensus: one accent, tokenised colour, no default font, no eyebrow on every block, no numbered markers on non-sequences, no middle-dot meta strings, WCAG AA, explicit empty, loading and error states, dark mode via tokens, and mobile collapse declared per component. Where the skills disagree (Lucide is banned by two and allowed by `redesign-existing-projects` when already installed; eyebrows allowed at 1 per 3 sections vs default-off), I followed the stricter rule only when it changes what a family member sees.

**Test conditions.** Vite dev server, Chromium via Playwright, widths 1440 / 900 / 390. Dates were Friday 13/11/2026 14:00 → Sunday 15/11/2026 16:00 (the app's own default for today). **IGN car routing returned HTTP 504 on every car request**, so the "Voiture si possible" tab never produced a ranking. The "Train si possible" tab produced a complete 20/20 ranking from the GTFS tables. Calculating 100 trips took about 2 min 30 s, inflated by the 504s.

**Evidence labels.** Each finding is tagged **[observed]** (rendered and measured in the browser) or **[code]** (read in source, not rendered). The never-rendered states are the invalid-dates error, the "horaires indisponibles" rail notice, the open "Compléter les trains" / "Villes comparées" / "Comparer les scénarios" cards, and the commune search added to `App.tsx:91-95` while this audit was running (it sits inside the collapsed "Modifier le départ" panel and is **unaudited**).

---

## Overall score: 45 / 100 (blocked, below the 80 commit gate)

| Area | Weight | Score | One-line reason |
|---|---|---|---|
| Information hierarchy (answer in 3 s) | 20 | 7 | The ranking finds a winner, but the biggest heading, the map label and the selected row name a different city |
| Mobile density (detail table, ranking) | 15 | 4 | Table is 625 px wide in a 344 px box; 55 % of it is hidden and rows are ~330 px tall |
| State design (empty / loading / error / incomplete) | 15 | 7 | Live progress and honest "À compléter" are good; the empty state claims an answer and the IGN outage is never surfaced |
| Typography | 10 | 5 | Arial everywhere; 9.6 px text in the train details; h1/h2 inverted |
| Colour and contrast | 10 | 6 | Coherent single blue, but 8 text pairs fail AA, input borders are 1.44:1, and 92 raw hex literals sit outside the tokens |
| Accessibility basics | 10 | 6 | Good labels, `role=status`, focus ring; but 20 px tap targets, 15 px map targets and a misplaced h1 |
| Map legibility | 8 | 4 | On a phone, labels render at 8 px, sea labels at 6 px, connector lines at 1.56:1 |
| Spacing and rhythm | 5 | 3 | Everything is the same 16 px-radius white card; 7 different radii; layout shifts when calculation starts |
| AI-generic patterns | 5 | 3 | Six tracked-caps eyebrows, 01/02/03 on unordered groups, middle-dot strings, SaaS card kit |
| Dark mode | 2 | 0 | None. `prefers-color-scheme: dark` renders identical `[13]` |
| **Total** | **100** | **45** | |

**Verdict.** The engine is careful and honest. It never fills a missing duration with zero, it shows sources, and it explains its method. The interface buries that work. After a successful calculation the page's largest result heading reads **"On se retrouve à Bourges"** while the ranking two inches to its left says **Paris** wins (2 h 10 vs 3 h 55) `[10]`. On a phone the winner sits 1 554 px down the page and the detail table hides cost and train details behind a sideways scroll `[12]`. The visual language is a competent default (Arial, shadcn blue, tracked-caps eyebrows on every card, identical rounded cards), so nothing says "family weekend". It reads as a generic SaaS dashboard. Five small changes fix most of this; none needs a new dependency.

---

## Findings, ranked by impact

Format: **what is wrong** (where, evidence) → **why it matters for this audience** → **fix**.

### 1. The page names the wrong meeting city after calculation [observed] (critical)

- **What.** `selected` is initialised to `"bourges"` (`App.tsx:25`, `useState("bourges")`) and only changes on a click (`setSelected` at `App.tsx:74` map, `:75` ranking row, `:79` comparison table). After calculation the ranking puts **01 Paris, 2 h 10** first, but the selected row, the map pill and the detail heading `<h3>On se retrouve à {nameOf(active.id)}</h3>` (`App.tsx:76`) all still say **Bourges, 3 h 55**. See `[09]` and `[10]`. The single number that states the answer, `.best-metric` ("Trajet le plus long à Paris · 2 h 10", `App.tsx:75`), is a 13 px blue line inside the right-hand card.
- **Why.** The 3-second test fails, and in the worst way: a relative skimming on a phone reads the largest sentence on the page, "On se retrouve à Bourges", and takes it as the recommendation. Before any calculation the same heading already asserts Bourges over an empty table `[02]`.
- **Fix (code, about 6 lines).**
  1. `App.tsx:25`: `useState<string|null>(null)` for the user's explicit pick. Then `const activeId = (selected && destinations.includes(selected)) ? selected : best?.id ?? destinations[0];`. The default view always follows the winner, and a click still overrides it.
  2. Put an answer block at the top of `.mainpane`, replacing the `.heading` eyebrow + h2 once `best` exists (`App.tsx:70`):
     ```tsx
     {best ? <div className="answer" role="status">
       <h1>Rendez-vous à {nameOf(best.id)}</h1>
       <p>Trajet le plus long : <strong>{duration(best.max)}</strong> · moyenne {duration(best.mean)} par sens</p>
     </div> : <h1>Où se retrouver ?</h1>}
     ```
     ```css
     .answer h1{font-size:clamp(1.75rem,5vw,2.5rem);line-height:1.1;letter-spacing:-.02em;margin:0 0 6px}
     .answer p{font-size:1.0625rem;color:var(--muted-foreground)}
     .answer strong{color:var(--foreground);font-variant-numeric:tabular-nums}
     ```
  3. Make the detail heading neutral when the selected city is not the winner: `Détail pour {nameOf(active.id)}`, keeping "On se retrouve à" for the winner only.

### 2. On a phone the detail table hides cost and train details and inflates rows to ~330 px [observed] (critical)

- **What.** `components/ui/table.tsx` wraps the table in `overflow-x-auto`, and `TableCell` forces `whitespace-nowrap`. At 390 px the table needs 625 px in a 344 px container (measured), so "Coût A/R" and "Source / horaires" are off-screen. Because the off-screen source cell carries 6 to 10 lines of train segments, every visible row is ~330 px tall and mostly blank `[12]`. `.source-cell{min-width:180px}` at ≤720 px (`globals.css:11`) makes it worse. The same clipping happens at 900 px `[11]`.
- **Why.** The train-by-train detail and the price are the second thing a family member wants ("which train do I take, how much?"), and nobody discovers a sideways scroll inside a card.
- **Fix (CSS only, no markup change).** At ≤720 px, turn each row into a stacked card:
  ```css
  @media(max-width:720px){
    .detail-card [data-slot=table-container]{overflow:visible}
    .detail-card table,.detail-card tbody,.detail-card tr,.detail-card td{display:block}
    .detail-card thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    .detail-card tr{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:14px 18px;border-bottom:1px solid var(--border)}
    .detail-card td{padding:0!important;white-space:normal}
    .detail-card td:nth-child(3)::before{content:"Aller ";color:var(--muted-foreground);font-weight:400}
    .detail-card td:nth-child(4)::before{content:"Retour ";color:var(--muted-foreground);font-weight:400}
    .detail-card td:nth-child(5)::before{content:"Coût A/R ";color:var(--muted-foreground);font-weight:400}
    .detail-card td.source-cell{grid-column:1/-1;min-width:0;max-width:none}
  }
  ```
  The thead stays in the accessibility tree. If the pseudo-element labels prove noisy for screen readers, add `data-label` attributes in `App.tsx:76` and use `content:attr(data-label)` instead.

### 3. Text in the train details renders at 9.6 px [observed] (major)

- **What.** `.rail-detail small` and `.fare` compute to **9.6 px**: `.source-cell` sets 12 px (`.75rem`), and the user-agent `small{font-size:smaller}` shrinks it again. Segment lines (`.segments`) are 12 px. See `[10]` ("Aller : 17:07 → 19:03 · 0 correspondance(s)", "15–50 € plein tarif").
- **Why.** Older relatives on phones cannot read 9.6 px. This is the line that tells them when to leave.
- **Fix.** `.source-cell small{font-size:inherit}` and lift `.source-cell` and `.segments` to `.8125rem` (13 px). Set the leg summary line in `font-weight:600` to separate it from the segments, instead of shrinking it.

### 4. On a phone the departure groups sit below the methodology footer [observed] (major)

- **What.** At ≤720 px `.mainpane{order:-1}` (`globals.css:6`) moves the whole results pane above the sidebar, so the "Vos points de départ" groups start at y = 4 058 px, after the footer "Comment le classement fonctionne" `[05]`. The ranking card is also capped at `max-height:390px` (≤1150 px, `globals.css:10`): only two rows show, inside a nested scroll `[11]`, `[12]`.
- **Why.** On a phone you cannot see or change who is travelling without scrolling past the whole result page, and scroll-inside-scroll is a known trap on touch.
- **Fix.** (a) CSS: at ≤720 px set `.ranking-card{max-height:none}` and `.destination-list{overflow:visible}`. Once finding 1's answer block exists, the full list is fine as a plain list. (b) Code, about 10 lines: on phone, render a one-line summary of the groups above the dates card ("Paris · Lyon · Bordeaux, modifier") as a `<details>` holding the existing group sections. This replaces the `order:-1` reshuffle.

### 5. Arial body and an inverted heading hierarchy [observed] (major)

- **What.** `body{font-family:Arial,Helvetica,sans-serif}` (`globals.css:6`). Every skill flags Arial/Helvetica as the default-font tell, and Arial has no tabular figures to match the `tabular-nums` rules on `.time-cell` and `.rank-number`. The only `<h1>` is the sidebar tagline "Tout le monde sur la même carte." (28 px, `App.tsx:69`), while the page's real question "Où se retrouver ?" is an `<h2>` at 34.4 px (`App.tsx:70`). Negative tracking (`h1 -.06rem`, `h2 -.08rem`, `.detail-heading h3 -.035rem`) on Arial makes "Où se retrouver ?" look cramped at 34 px `[01]`.
- **Why.** A screen-reader user's first heading is a slogan, not the task. Visually, the tagline competes with the answer.
- **Fix.** Option A, zero dependencies: `font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;`. That gives SF Pro on iPhone/Mac, Segoe UI on Windows and Roboto on Android, all with real tabular figures. Option B, one self-hosted variable font: Atkinson Hyperlegible Next (designed for low-vision readers, a direct fit for older relatives), with `font-display:swap`. Then demote the sidebar tagline to a `<p class="lede">` and make the answer block (finding 1) the `<h1>`. Set display tracking to `-0.02em` and remove it below 20 px.

### 6. The car-routing outage is invisible and the default tab shows no answer [observed] (major)

- **What.** With IGN returning 504, the default tab "Voiture si possible" shows 20 rows of "À compléter" and a grey 13 px status line, "Calcul terminé. 38 trajets aller-retour restent à compléter." `[08]`. The cause ("Service IGN indisponible (HTTP 504)") appears only as 12 px grey text in a table cell `[07]`. Nothing suggests that "Train si possible" has a full ranking ready `[09]`.
- **Why.** A family member concludes the tool is broken, though one tap would have shown the answer.
- **Fix (code).** When `failures>0` and every failure is a car leg, render an alert under the dates card:
  ```tsx
  <p className="alert" role="alert">Le calcul routier (IGN) ne répond pas en ce moment. Le classement en train est complet : <button className="text-button" onClick={()=>setTab("train")}>voir le classement en train</button>, ou réessayez plus tard.</p>
  ```
  `.alert{background:#fff6e5;border:1px solid #f0d49a;color:#6b4a00;border-radius:var(--radius);padding:12px 14px;font-size:.9375rem}` (6b4a00 on fff6e5 = 7.5:1). Also add a retry button ("Réessayer les trajets en voiture") next to it; the matrix-skip logic in `calculate()` (`App.tsx:55`) already re-requests only missing legs.

### 7. Empty and incomplete states print raw placeholders [observed] (major)

- **What.** Before calculation the cost pill reads **"Coût A/R — · — / pers."** (`App.tsx:76`, `costLabel` returns `—` twice) `[02]`. The ranking rank column shows a lone "·" `[01]`. The whole detail table renders as "—" over an "On se retrouve à Bourges" heading.
- **Why.** Garbage strings erode trust in the numbers that follow.
- **Fix.** Hide the cost pill when `costLabel(c)==="—"` (the same guard already used for the ranking rows at `App.tsx:75`). Before the first calculation, replace the detail card with one sentence: `Choisissez vos dates puis lancez le calcul : le classement et le détail par groupe apparaîtront ici.` Show an empty rank cell instead of "·".

### 8. Contrast failures (WCAG AA) [observed, computed] (major)

Measured against the actual backgrounds:

| Selector | Colour on bg | Ratio | Size | Status |
|---|---|---|---|---|
| `.rank-number` | #8a9ab0 / #fff | 2.87 | 13 px | fail |
| `.rank-number` in `.selected` | #8a9ab0 / #edf3ff | 2.57 | 13 px | fail |
| `.map-caption`, `.ranking-footer` | #738299 / #fff | 3.90 | 12 px | fail |
| `.detail-note`, `.method` | #72829b / #fff | 3.90 | 12–13 px | fail |
| `.map-legend` | #6b7f9b / #fff | 4.09 | 12 px | fail |
| `.destination-time` | #687e9b / #fff | 4.16 | 13 px | fail |
| `.number` (group 01/02) | #647b9e / #fff | 4.31 | 12 px | fail |
| `.brand-sub`, `.calculation-status`, `.sidebar-foot` | #6a7890 / #fff | 4.47 | 12–13 px | fail (just) |
| `input` border (`--input`) | #ced8e7 / #fff | 1.44 | UI boundary | fail (1.4.11 needs 3:1) |
| Loading button "Calcul en cours…" | #fff / #7c9bf0 (`disabled` opacity .6) | 2.69 | 15 px | fail: it carries live status |
| Unranked destination dot | #a1b3cb / #fff | 2.14 | graphic | fail (3:1) |
| `.sea-label` | #8198b1 / #f0f5fa | 2.71 | 10 px | decorative, but illegible |

**Fix.** Collapse the 14 near-identical greys (#536680, #5e7295, #61738e, #627492, #637089, #647b9e, #667690, #687e9b, #6a7890, #6b7f9b, #72829b, #738299, #7c889a, #8a9ab0) into **one** token: `--muted-foreground:#56637a` (6.07 on white, 5.60 on `--background`, 5.45 on the selected row). Set `--input:#7b8ea8` (3.35:1) for input borders. Replace `button:disabled{opacity:.6}` with an explicit busy style for `.calculate[aria-busy=true]` that keeps `--primary`. Unranked dot `#7b8ea8`. `.mode-preview` (`globals.css:6`) is dead CSS; no element uses it.

### 9. The map is illegible on a phone [observed, computed] (major)

- **What.** The SVG viewBox is 590 wide and renders at 344 px on a 390 phone, a scale of 0.58 (`travel-map.tsx:11`). So: origin labels 14 → **8.2 px**; selected-city pill text 14 → 8.2 px; sea labels 10 → **5.8 px**; destination dots r=4 → **2.3 px** radius; hit circle r=13 → **15 px diameter** target (WCAG 2.5.8 minimum is 24 px). Connector lines `stroke="#6287e9" opacity=".4"` blend to **1.56:1** on white. Land vs sea is #fff vs #f0f5fa, **1.10:1**, with region strokes at 1.23:1, so the coastline barely exists `[04]`, `[12]`. The 42×62 grid pattern is decoration.
- **Why.** On a phone the map conveys "three dots and a blue pill" and is untappable. The ranking list is the real control.
- **Fix.** In `globals.css`: `@media(max-width:720px){.origin-label{font-size:22px}.sea-label{display:none}}` (22 × 0.58 ≈ 12.8 px). In `travel-map.tsx:11`: connector `opacity=".8" strokeWidth="1.5"`; delete the `#grid` pattern and its rect; sea fill `#d4e0ee` and region stroke `#b9c7d9` (makes the hexagon read); hit circle `r={20}`. Keep the map as a secondary illustration on phone and say so in the caption: `Touchez une ville dans la liste ou sur la carte.`

### 10. Touch targets are 20–32 px [observed] (major)

- **What.** `summary` "Modifier le départ" is **20 px** tall; `.text-button` (Ajouter un groupe, Copier le lien, Arrêter, Afficher) is 28–29 px; `.quick-days button` is 31.5 px; scenario tabs wrap to two lines on phone ("Voiture si / possible") `[05]`. Measured with `getBoundingClientRect`.
- **Why.** Fat-finger misses on the most-used controls; wrapped tab labels look broken (hallmark gate 49).
- **Fix.** `.group-details summary,.text-button,.quick-days button{min-height:44px;display:inline-flex;align-items:center}`. At ≤720 px shorten the tab labels instead of wrapping: render `Voiture`, `Train`, `Comparer` (CSS: hide a `<span class="long">` suffix). That needs a one-word wrap in `App.tsx:73`.

### 11. The table row borders are navy because the base border colour is missing [observed] (minor, one line)

- **What.** `TableRow` uses `border-b` with no colour, and Tailwind v4 preflight defaults `border-color` to `currentColor`. `vendor/shadcn-tailwind-4.13.0.css` (629 lines, grepped) has no `@layer base` border rule. Computed: `rgb(23,41,74)`, i.e. `--foreground`. Result: heavy dark rules between rows `[02]`, `[10]`. This is the "border on every row" tell, in the darkest possible colour.
- **Fix.** Add to `globals.css`: `@layer base{*,::before,::after{border-color:var(--border)}}`. This is shadcn's own default.

### 12. Generic-template tells (hallmark audit) [observed] (major as a set)

- **Eyebrow on every section.** Six tracked-caps labels: `.brand-sub` "LE WEEK-END, ENSEMBLE", "VOS POINTS DE DÉPART", "LE BON ENDROIT POUR TOUS", "FRANCE · 20 VILLES COMPARÉES", "ÉQUITÉ DES TRAJETS", "SCÉNARIO 4 · DURÉES PAR GROUPE" (`App.tsx:68-76`, `.eyebrow` in `globals.css:6`). At 900 px the last one wraps to three lines `[11]`. **Fix:** delete all except the map's count, rewritten in sentence case as plain text (`20 villes comparées`). Delete `.brand-sub`.
- **Numbered markers on a non-sequence.** `<span className="number">0{i+1}</span>` (`App.tsx:69`) on groups that have no order. It also breaks at 10 groups ("010"). **Fix:** remove it; the group name is the label. Rank numbers in the ranking stay, because ranking is a sequence.
- **Middle-dot meta strings.** "Coût 102–490 € · 34–163 € / pers.", "FRANCE · 20 VILLES", "Scénario 1 · 2 voiture / 1 train", the ranking footer "… classables · aucune durée…". **Fix:** use line breaks or "soit": `Coût 102–490 €, soit 34–163 € par personne`.
- **SaaS card kit.** Every block is the same white `.card` with a 16 px radius and a 1 px border: dates, map, ranking, detail and three `<details>` cards. Seven radius values coexist (16, 12, 9, 7, 6, 99, `--radius` .6rem). **Fix:** one radius token (`--radius:12px`; inputs and buttons `calc(var(--radius) - 4px)`). Turn the three collapsible cards into one plain section with hairline separators instead of three boxes `[02]`.
- **Mid-render token improvisation.** `globals.css` defines 17 tokens in `:root`, then uses about 75 raw hex literals; `travel-map.tsx` adds about 17 more (92 in total). **Fix:** this is a prerequisite for dark mode (finding 14), not an aesthetic nicety.
- **What is *not* slop.** No gradients, glass, emoji, invented metrics or bouncy motion. The copy is plain, specific French. Error and method text is honest. Keep all of that.

### 13. Layout shift and an unlabelled long wait during calculation [observed] (minor)

- **What.** Starting the calculation inserts the progress bar under the status line, pushing everything below down ~15 px `[06]`. The status names each trip ("Voiture · Lyon → Bourges"), which is good, but there is no time estimate for a ~2.5 min run.
- **Fix.** Reserve the bar's space: `.dates-card [data-slot=progress]{margin-top:8px}` plus a `min-height:30px` wrapper that is always rendered (`App.tsx:71`). Status copy: `Calcul en cours : {done} trajets sur {total}`.

### 14. No dark mode [observed] (minor in weight, real cost)

- **What.** `[13]` is identical to the light render under `prefers-color-scheme: dark`; no `color-scheme` declaration, no `theme-color`.
- **Why.** Evening use on phones is the likely context for planning a weekend; a white page at night is harsh. It is not urgent for correctness.
- **Cost, honestly priced.** It is **not** a quick win: the 92 hard-coded hex values (finding 12) must become tokens first, and the SVG fills in `travel-map.tsx:11` must read CSS variables (`fill="var(--map-land)"`).
- **Fix, once tokenised.** `:root{color-scheme:light dark}` and `@media(prefers-color-scheme:dark){:root{--background:#0f1726;--foreground:#e6ecf5;--card:#172033;--muted-foreground:#9aa8bd;--border:#2a3550;--input:#5c6b85;--primary:#2458e6;--accent:#1d2b4d;--accent-foreground:#a9c1ff;--map-sea:#0f1726;--map-land:#1e2940;--map-stroke:#3a4866}}`. Checked: #e6ecf5 on #0f1726 is 15.1:1; #9aa8bd on #172033 is 6.75:1; white on #2458e6 is 5.81:1.

### 15. Accessibility basics: what is already right, and the gaps [code + observed]

- **Right:** `lang="fr"`; `role="status"` on the calculation line; `aria-valuetext` on progress; every select and input has an `aria-label`; the focus ring is 3 px, 3.61:1, not animated; `prefers-reduced-motion` stops the spinner; map points are keyboard-focusable with Enter/Space.
- **Gaps:** the h1 is misplaced (finding 5). Map points use `role="button"` plus `aria-pressed` while the ranking buttons have no `aria-pressed`/`aria-current`, so selection state is announced on the map only (`App.tsx:75`): add `aria-current={active?.id===r.id||undefined}`. The invalid-dates error uses `role="alert"` **and** `aria-live="assertive"` (`App.tsx:71`), which is redundant; keep `role="alert"`. There is no skip link to "Résultats"; with the sidebar first on desktop, keyboard users tab through 3 × 6 group controls before the calculate button.

---

## Prioritised plan: top 5, most improvement for least code

Order = (impact on "where do we meet" for a phone user) ÷ (lines changed). None adds a dependency.

1. **Follow the winner and state it** (finding 1). `App.tsx:25` selection default plus a 5-line answer block at the top of `.mainpane`; neutral detail heading. About 10 lines. Fixes the 3-second test and removes the contradiction.
2. **Stack the detail table on phone** (finding 2) and **un-shrink the 9.6 px text** (finding 3). CSS only, about 15 lines in `globals.css`. Makes durations, cost and trains readable at 390 px.
3. **One muted token and one border base rule** (findings 8 and 11). Replace the 14 greys with `--muted-foreground:#56637a`, set `--input:#7b8ea8`, add `@layer base{*{border-color:var(--border)}}`. A search-and-replace in `globals.css`. Clears every AA text failure and the navy row rules.
4. **System font stack, heading order and eyebrow purge** (findings 5 and 12). Change one `font-family` line, demote the sidebar h1, delete five `.eyebrow` spans and the `0{i+1}` markers. About 10 lines. Removes most of the generic-template feel.
5. **Surface the outage, with a way out** (finding 6), plus **hide the "— · —" pill** (finding 7). One conditional alert with a "voir le classement en train" button, one guard. About 8 lines. Turns today's "broken" impression into an answer.

Next tier, once those land: 44 px touch targets (finding 10), map legibility on phone (finding 9), the phone group summary (finding 4b), then tokenisation followed by dark mode (findings 12 and 14).

**Hallmark summary: 2 critical · 10 major · 3 minor.** Verdict: reads as a generic SaaS dashboard; the structure is sound, so fix the hierarchy and mobile table first.

---

### Session note
[LEARN:gotcha] Finding: Tailwind v4 preflight sets `border-color: currentColor`; the vendored shadcn CSS here has no `@layer base` border rule, so every unqualified `border-b` (shadcn `TableRow`) draws in `--foreground` navy.
Impact: Heavy dark row rules in every table.
Apply: Add `@layer base{*,::before,::after{border-color:var(--border)}}` whenever shadcn is vendored without its base layer.
