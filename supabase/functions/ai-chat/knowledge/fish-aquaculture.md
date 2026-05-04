# Aquaculture Knowledge Base — West African Fish Farming

## Species Overview

### Catfish (Clarias gariepinus — African Mud Catfish)
- Most common commercial species in Nigeria, Cameroon, Ghana
- Hardy, air-breathing — tolerates low DO better than tilapia
- Market weight: 600g–1.5kg (typically 800g–1kg for table fish)
- Grow-out period: 4–6 months from fingerling to harvest
- Stocking density: 50–150 fish/m³ in tanks; 1–3 fish/m² in earthen ponds
- FCR: 1.2–1.8 (good management); target ≤1.5
- Fingerling size at stocking: 5–10g (post-juvenile, 6–8 weeks old)
- Weekly ABW targets:
  - Week 4: ~20g
  - Week 8: ~80g
  - Week 12: ~200g
  - Week 16: ~400g
  - Week 20: ~700g
  - Week 24: ~900g–1.2kg (harvest window)

### Tilapia (Oreochromis niloticus — Nile Tilapia)
- Second most farmed species in the region
- Cannot breathe air — more sensitive to low DO than catfish
- Market weight: 400g–800g
- Grow-out period: 5–7 months
- Stocking density: 1–3 fish/m² earthen pond; 20–50/m³ tanks
- FCR: 1.5–2.0
- Prone to overpopulation if mixed sexes — use mono-sex (male) fingerlings
- Weekly ABW targets roughly 60–70% of catfish at same age

### Clarias (Clarias species / Heteroclarias hybrid)
- Hybrid between C. gariepinus and Heterobranchus bidorsalis
- Fastest grower of the three; often reaches 1kg in 4 months
- Higher feed cost but better FCR (1.0–1.4)

## Water Quality Parameters

### Critical thresholds (act immediately if breached)
| Parameter | Optimal | Warning | Critical |
|-----------|---------|---------|----------|
| Temperature (°C) | 26–30 | 24–25 or 31–33 | <22 or >34 |
| Dissolved Oxygen (mg/L) | ≥5 | 3–4.9 | <3 |
| pH | 6.5–8.5 | 6.0–6.4 or 8.6–9.0 | <6 or >9 |
| Ammonia NH₃ (mg/L) | <0.02 | 0.02–0.1 | >0.1 |
| Nitrite NO₂ (mg/L) | <0.1 | 0.1–0.5 | >0.5 |

### What to do when parameters are off
- **Low DO (<3)**: Emergency aeration immediately. Reduce feeding. Check biomass load.
- **High ammonia (>0.1)**: Partial water change (30–50%). Reduce feeding rate by half. Check pH — ammonia toxicity increases above pH 8.
- **High nitrite**: Partial water change. Add salt (5–10g/L NaCl temporarily to reduce nitrite uptake).
- **High temperature (>33°C)**: Shade pond. Add cool water if available.
- **Low pH (<6.5)**: Lime (agricultural limestone) at 50–100kg/hectare. Check once daily until stable.

## Feeding Guidelines

### Feed types by growth stage
- **Starter (fry, 0–5g)**: 45–50% protein, feed every 2–3 hours, ~10% body weight/day
- **Grower (juvenile, 5–50g)**: 40–45% protein, 3–4× daily, 5–7% body weight/day
- **Finisher (grow-out, 50g+)**: 35–40% protein, 2–3× daily, 3–5% body weight/day

### Signs of overfeeding
- Uneaten feed on surface 30 min after feeding
- Ammonia spike next day
- Cloudy water

### Signs of underfeeding
- Fish rushing surface aggressively at feeding
- ABW below target for age
- Cannibalism in catfish

## Sampling (Weight Checks)
- Sample every 2 weeks — weigh 30–50 fish per pond
- Calculate ABW (average body weight) from sample
- Adjust feed rate to current biomass: `biomass_kg = ABW_g × fish_count / 1000`
- Daily feed = biomass × feeding_rate%

## Common Diseases

### Bacterial
- **Motile Aeromonas Septicemia (MAS)**: Red sores, ulcers, hemorrhaging. Treat with oxytetracycline or doxycycline in feed (5–10 days).
- **Columnaris**: White/grey patches on skin/fins. Improve water quality. Potassium permanganate bath (10 mg/L for 30 min).

### Parasitic
- **Trichodina / Ichthyo**: White spots, fish flashing. Formalin bath (25 ppm for 1 hour) or salt bath (10g/L for 10–20 min).
- **Anchor worms / Fish lice**: Visible parasites on skin. Potassium permanganate bath.

### Environmental
- **Oxygen depletion**: Sudden mass mortality at dawn. Emergency aeration. Reduce biomass.
- **Ammonia toxicity**: Fish at surface gasping, hemorrhagic gills. Water change + stop feeding.

## Harvest Decision
- Harvest when ABW reaches target market weight (600g–1kg for catfish)
- Best practice: partial harvest (remove largest fish first = "grading harvest")
- Avoid feeding 24 hours before harvest
- Harvest at dawn or dusk (cooler, lower stress)
- Post-harvest: disinfect pond before restocking (500g lime/m²)

## Economics (typical West Africa)
- Catfish farm-gate price: 1,500–2,500 XAF/kg (Cameroon); ₦1,200–2,000/kg (Nigeria)
- Feed cost typically 60–70% of production cost
- Break-even FCR depends on feed price vs. sale price ratio
- Target: >30% profit margin on revenue

## Eden AI — Aquaculture Responses
When the farmer's farm is a fish farm (aquaculture):
- Use "pond" not "pen" or "farm unit"
- Use "fingerlings" not "chicks" for young fish
- Use "stocking" not "placement"
- Use "ABW" (average body weight) not "average weight gain" when discussing growth
- Reference DO, ammonia, nitrite as the primary health indicators
- For mortality questions, first ask about water quality — 80% of fish deaths are water quality related
- Distinguish between catfish (air-breather, more resilient) and tilapia (gill-breather, more sensitive)

## Formulas (use exact arithmetic in answers)

### Average Body Weight (ABW)
`ABW_g = sum(individual_weights_g) / number_of_fish_weighed`
Sample 5–50 fish, prefer 20–30 for accuracy. Sample bias is the #1 mistake — randomise capture, don't only catch the slow ones near the surface.

### Specific Growth Rate (SGR)
`SGR (% per day) = ((ln(ABW_now) - ln(ABW_previous)) / days_between) × 100`

Worked example: pond sampled 14 days ago at 120 g, today 180 g.
`SGR = (ln(180) - ln(120)) / 14 × 100 = (5.193 - 4.787) / 14 × 100 = 2.9 %/day` — healthy grow-out.

Healthy SGR ranges:
- Catfish 50–500 g: 2.5–4.0 %/day
- Catfish 500 g+: 1.0–2.0 %/day
- Tilapia juvenile: 2.0–3.0 %/day
- Tilapia grow-out: 1.0–2.0 %/day

If SGR drops below 1 %/day for an active grow-out: check water quality first, then feed quality, then stocking density.

### Biomass
`biomass_kg = (ABW_g × current_fish_count) / 1000`

Worked example: 1,000 catfish at ABW 250 g → biomass = 250 × 1000 / 1000 = **250 kg**.

### Daily Feed Amount
`daily_feed_kg = biomass_kg × feeding_rate_percent / 100`

Feeding rate by size:
- Fry (0–5 g): 8–10%
- Fingerling (5–50 g): 5–7%
- Juvenile (50–200 g): 4–5%
- Grow-out (200–500 g): 3–4%
- Finisher (500 g+): 2–3%

Worked example: 250 kg biomass at grow-out, 4% rate → 10 kg feed/day, split into 2–3 feedings.

### Feed Conversion Ratio (FCR)
`FCR = total_feed_consumed_kg / total_weight_gained_kg`

Worked example: pond fed 320 kg over 4 weeks. Started at 200 kg biomass, now 400 kg → gain = 200 kg. `FCR = 320 / 200 = 1.6` — acceptable for catfish.

FCR targets:
- Catfish: ≤1.5 (excellent), 1.6–1.8 (good), >2.0 (investigate)
- Tilapia: ≤1.7 (excellent), 1.8–2.0 (good), >2.2 (investigate)
- Clarias hybrid: ≤1.4

If FCR is high: feed quality issue, water quality issue (fish under stress eat more for less gain), overfeeding (unused feed rotting), or wrong feeding rate for current ABW.

### Days to Market Estimate
`days_to_market = ln(target_weight / current_ABW) / SGR × 100`

Worked example: pond at ABW 250 g, target 800 g, current SGR 2.5 %/day.
`days = ln(800/250) / 2.5 × 100 = ln(3.2) / 2.5 × 100 = 1.163 / 2.5 × 100 = 47 days` (~7 weeks).

## Quick Diagnostics — symptom to likely cause

### Fish at surface gasping for air
1. Most likely: low dissolved oxygen. Common at dawn after a hot day or after heavy rain (turnover). Aerate immediately.
2. Possible: ammonia toxicity. Check NH₃ — if >0.1 mg/L, partial water change.
3. Catfish doing this is less alarming than tilapia (catfish breathe air). But still abnormal — investigate.

### Fish dying overnight, dead fish in morning
1. Oxygen crash overnight. Common in heavily stocked ponds, after rain, in hot still weather. Check biomass-to-pond-volume ratio.
2. Predator (snake, otter, bird) — look for puncture wounds or missing fish (not just dead).
3. Disease outbreak — check for visible lesions, abnormal behaviour pre-death.

### Fish flashing (rubbing against pond bottom/sides)
- Almost always parasitic — Trichodina, Ichthyophthirius, or fish lice. Salt bath or potassium permanganate.

### White patches on body
- Columnaris (saddleback disease) or fungal infection (after handling stress). Improve water quality. KMnO₄ bath.

### Red sores, hemorrhagic ulcers
- Motile Aeromonas Septicemia (MAS). Antibiotic in feed. Quarantine affected fish if possible.

### Fish not eating
1. Water temperature too low (<22°C) — slows metabolism, normal in cold months. Reduce feeding rate.
2. Recent ammonia/nitrite spike — fish stressed.
3. Feed gone bad — check for mould, smell.
4. Disease early stage — observe for other symptoms.

### Cloudy or green water
- Green: phytoplankton bloom, generally good (oxygen production) up to a point. Excessive bloom can crash overnight → oxygen crash.
- Brown/muddy: clay suspension after rain, usually clears in a day. Long-term turbidity → lime to flocculate.
- Grey/foul-smelling: organic overload from overfeeding. Reduce feed, partial water change.

### Slow growth, low SGR
1. Water quality (DO, ammonia) — most common.
2. Wrong feed protein for size — fingerlings need 40-45%, grow-out 35-40%.
3. Overstocked — biomass too high for pond. Thin out by partial harvest.
4. Genetics — if you mixed batches, dominant ones eat more. Sort by size.

## Pond Preparation Checklist (new pond / between cycles)

1. **Drain completely** if possible. Sun-dry pond bottom for 5–7 days — kills pathogens and aerates the soil.
2. **Lime application**: 200–500 kg agricultural lime per hectare. Adjusts pH and kills residual bacteria/parasites.
3. **Fill with clean water**, let stand 7–10 days for plankton to develop.
4. **Test water**: pH 6.5–8.5, DO ≥5, ammonia <0.02. If ok, stock.
5. **Acclimate fingerlings**: float bag in pond water for 20 min before release. Don't dump straight in — temperature shock kills.
6. **First-week feeding**: light. Fingerlings stressed from transport, full appetite returns by day 3–5.

## Common Beginner Mistakes

- **Overstocking**: more fish per cubic meter than the pond can support. Always calculate biomass capacity first. Catfish in tanks: 50 kg/m³ max for grow-out. Earthen ponds: 4–6 tonnes/hectare.
- **Underfeeding to save money**: extends grow-out time, hurts FCR, ultimately costs more.
- **Feeding spoiled feed**: feed loses protein and goes mouldy in humid storage. Use within 30 days of opening, store airtight + dry.
- **Mixing batches without sorting**: dominant fish bully smaller ones, growth diverges. Sort and segregate every 4 weeks if mixing was unavoidable.
- **Ignoring water quality until fish die**: by then it's emergency mode. Test DO/pH/ammonia weekly minimum; daily during hot/rainy periods.
- **No records of feed input**: makes FCR impossible to calculate, makes troubleshooting blind. Log every feeding.
- **Buying cheap "no-name" feed**: protein is often below label. FCR will be terrible. Stick to known brands (Coppens, Skretting, Ranaan, Olam, Aller Aqua) or test small batches.
- **Mono-sexing tilapia carelessly**: if even 5% female slip in, you'll have hundreds of small unwanted offspring stunting growth in 6 weeks.

## Seasonal & Market Timing (West Africa)

- **Demand spikes**: Christmas/New Year (Dec), Easter (Mar/Apr), Ramadan/Eid (varies), independence days. Plan harvests 2–4 weeks ahead.
- **Price drops**: post-Christmas glut (Jan), rainy-season abundance (May–Aug in Cameroon/Nigeria) when wild catch is high.
- **Rainy season risks**: temperature drops, oxygen turnover from stratification breakdown, ammonia after heavy runoff. More frequent water quality checks.
- **Dry season risks**: high water temperature, evaporation concentrates pollutants. Top-up water and shade where possible.
- **Hatchery business**: catfish fingerling demand peaks in Feb–April (people stocking ahead of rainy season). Premium prices in this window.

## Stocking Density Rules of Thumb

| System | Catfish | Tilapia |
|---|---|---|
| Earthen pond | 1–3 fish/m² | 1–2 fish/m² |
| Concrete tank | 50–150 fish/m³ | 20–50 fish/m³ |
| Cage culture | 100–200 fish/m³ | 50–80 fish/m³ |
| Recirculating (RAS) | 200–400 fish/m³ | 100–150 fish/m³ |

Higher densities require: aeration, frequent water changes, premium feed, vigilant monitoring. Smallholder farmers should stay at the lower end until they have months of clean records.

## Decision: When to Harvest

Harvest when ANY of these is true:
1. ABW reaches market target (600–1000 g catfish, 400–800 g tilapia).
2. SGR has dropped below 1 %/day for 2+ consecutive samples — feed conversion is now poor, more days = more cost without proportional gain.
3. Pond is approaching biomass capacity — overcrowding suppresses growth and risks oxygen crash.
4. Feed prices spiked or sale prices peaked — economic harvest decision.
5. Disease outbreak — partial emergency harvest of healthy stock to limit losses.

Do NOT harvest when:
- Fish under treatment (antibiotic withdrawal period — typically 14–21 days).
- Within 24h of feeding (fish are gut-full, weight is misleading and storage degrades).
- During heavy rain (stress, transport difficulty).

