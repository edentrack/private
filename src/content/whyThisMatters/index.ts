export const WHY_THIS_MATTERS = {
  abw_sampling: {
    title: 'Average Body Weight (ABW)',
    summary: 'ABW is the mean weight of fish in a pond, measured from a random sample. It drives feed calculations, biomass projections, and harvest timing.',
    formula: 'ABW = Σ(individual weights) ÷ sample count',
    learnMorePrompt: 'Explain what Average Body Weight (ABW) means in fish farming and how I should use it to manage feeding amounts and harvest decisions for my pond.',
  },
  sample_size_recommendation: {
    title: 'Sample Size for ABW',
    summary: 'Weigh 30–50 fish per pond for reliable ABW. Fewer than 10 fish skews the result - one unusually large fish can shift your average by 10%+ and cause over- or under-feeding.',
    learnMorePrompt: 'How many fish should I weigh when sampling my pond to get a reliable Average Body Weight? What happens if I sample too few fish?',
  },
  sgr: {
    title: 'Specific Growth Rate (SGR)',
    summary: 'SGR measures daily growth as a % of body weight. Healthy catfish/tilapia grow at 2–4% SGR. Below 1% means something is wrong - check feed quality, water quality, and stocking density.',
    formula: 'SGR = (ln(W₂) − ln(W₁)) ÷ Δdays × 100',
    learnMorePrompt: 'What is Specific Growth Rate (SGR) and how do I interpret it for my catfish or tilapia pond? What causes a low SGR and how do I fix it?',
  },
  biomass_projection: {
    title: 'Projected Biomass',
    summary: 'Total live weight of all fish in a pond, estimated from ABW × fish count. Use it to plan feed quantities, decide when to partial-harvest, and estimate revenue before netting the pond.',
    formula: 'Biomass (kg) = (ABW in grams × fish count) ÷ 1000',
    learnMorePrompt: 'How do I use projected biomass to plan feeding, partial harvest, and revenue projections for my fish farm?',
  },
  dissolved_oxygen: {
    title: 'Dissolved Oxygen (DO)',
    summary: 'DO is the oxygen fish breathe from water. Below 3 mg/L is lethal. DO crashes overnight and is lowest at dawn - check early morning. Emergency response: run aerators, stop feeding, and do a water exchange.',
    learnMorePrompt: 'Explain dissolved oxygen in fish ponds: what the safe levels are, why DO crashes at dawn, and what I should do immediately if my fish are gasping at the surface.',
  },
  ammonia: {
    title: 'Ammonia (NH₃)',
    summary: 'Fish excrete ammonia and uneaten feed releases it too. Above 0.02 mg/L causes chronic stress; above 0.1 mg/L causes mass mortality. Overfeeding and poor water exchange are the main causes.',
    learnMorePrompt: 'Explain ammonia toxicity in fish ponds: what causes it, what the safe levels are, and what I should do right now if ammonia is too high.',
  },
  nitrite: {
    title: 'Nitrite (NO₂)',
    summary: 'Nitrite is produced when ammonia breaks down. It blocks fish blood from carrying oxygen (brown blood disease). Safe below 0.1 mg/L; critical above 0.5 mg/L. Salt at 5–10 g/L counteracts nitrite toxicity.',
    learnMorePrompt: 'What is nitrite poisoning in fish and how is it different from ammonia toxicity? What should I do if nitrite levels are too high in my pond?',
  },
  ph_for_fish: {
    title: 'pH for Fish',
    summary: 'Fish thrive at pH 6.5–8.5. Outside this range, immune function drops and disease resistance weakens. Heavy rain acidifies ponds; dense algae blooms push pH above 9 by afternoon.',
    learnMorePrompt: 'What pH range is ideal for catfish and tilapia? What causes pH swings in a pond and how do I stabilize it?',
  },
  water_temperature: {
    title: 'Water Temperature',
    summary: 'Tropical fish grow fastest at 26–30°C. Below 22°C metabolism slows and immunity drops; above 33°C DO falls and stress rises. Check temperature at dawn - it is the daily minimum.',
    learnMorePrompt: 'How does water temperature affect catfish and tilapia growth? What temperature range is ideal and what should I do if it is too hot or too cold?',
  },
  fcr: {
    title: 'Feed Conversion Ratio (FCR)',
    summary: 'FCR is kg of feed needed to produce 1 kg of live weight gain. Lower is better. Good FCR: broilers 1.6–1.8, catfish 1.2–1.5, rabbits 3.0–3.5. A rising FCR is a warning - check feed quality, health, and stocking density.',
    formula: 'FCR = feed consumed (kg) ÷ weight gained (kg)',
    learnMorePrompt: 'Explain Feed Conversion Ratio (FCR): what is a good FCR for broilers, fish, and rabbits, and what causes FCR to be too high on a farm?',
  },
  mortality_threshold: {
    title: 'Mortality Rate Thresholds',
    summary: 'Target: broilers < 5% per cycle, rabbits < 10% kit-to-weaning, fish < 2% per month. A sudden spike in any species demands immediate investigation - disease, water quality failure, or management breakdown.',
    learnMorePrompt: 'What is an acceptable mortality rate for broilers, fish, and rabbits? How do I investigate a sudden spike in mortality on my farm?',
  },
  stocking_density: {
    title: 'Stocking Density',
    summary: 'Overcrowding causes oxygen depletion, waste buildup, stress-induced disease, and poor FCR. Recommended: broilers 10–12/m², layers 6–8/m², catfish 1–3/m³. Match stocking rate to your aeration and feed capacity.',
    learnMorePrompt: 'What are the recommended stocking densities for broilers, layers, catfish, and rabbits? What are the signs of overcrowding and how should I correct it?',
  },
} as const;

export type WhyThisMattersTopicKey = keyof typeof WHY_THIS_MATTERS;
