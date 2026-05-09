/**
 * Fish disease library — Phase B Step 18.
 *
 * Searchable reference of the top diseases affecting West/Central African
 * aquaculture. Each entry has standardised fields so the UI can filter by
 * species / severity and Eden AI can use them as grounded knowledge.
 *
 * NOT a substitute for veterinary advice. UI must surface a "consult a fish
 * vet for confirmation" warning on every card.
 */

export type DiseaseSeverity = 'mild' | 'moderate' | 'severe' | 'fatal';
export type DiseaseCategory =
  | 'bacterial'
  | 'viral'
  | 'parasitic'
  | 'fungal'
  | 'environmental'
  | 'nutritional';

export interface FishDisease {
  id: string;
  name: string;
  scientificName?: string;
  category: DiseaseCategory;
  severity: DiseaseSeverity;
  affectedSpecies: Array<'Tilapia' | 'Catfish' | 'Clarias' | 'Other Fish'>;
  symptoms: string[];
  causes: string[];
  treatment: string[];
  prevention: string[];
  /** A short, action-oriented summary for the search-results card. */
  oneLiner: string;
}

export const FISH_DISEASES: FishDisease[] = [
  {
    id: 'columnaris',
    name: 'Columnaris (Cotton Mouth)',
    scientificName: 'Flavobacterium columnare',
    category: 'bacterial',
    severity: 'severe',
    affectedSpecies: ['Tilapia', 'Catfish', 'Clarias', 'Other Fish'],
    symptoms: [
      'White or grey patches on skin, mouth, gills',
      'Frayed fins, cottony tufts on body',
      'Lethargy, loss of appetite',
      'Rapid breathing if gills affected',
    ],
    causes: [
      'High water temperature (>28°C) accelerates spread',
      'Poor water quality (low DO, high ammonia)',
      'Stress (handling, transport, overcrowding)',
      'Wounds from netting or fighting',
    ],
    treatment: [
      'Salt bath: 1–3% (10–30 g/L) for 30 minutes daily, 3–5 days',
      'Potassium permanganate: 2 mg/L pond-wide for 4 hours',
      'Methylene blue: 1 mg/L for 5 days in tanks',
      'Antibiotic feed (oxytetracycline) 7–10 days if severe - vet only',
      'Reduce stocking density during treatment',
    ],
    prevention: [
      'Keep DO >5 mg/L',
      'Avoid sudden temp swings',
      'Disinfect nets/equipment between ponds',
      'Quarantine new fish 14 days before mixing',
    ],
    oneLiner: 'Cottony patches on skin/mouth - salt bath + improve water quality.',
  },
  {
    id: 'aeromonas',
    name: 'Motile Aeromonas Septicaemia',
    scientificName: 'Aeromonas hydrophila',
    category: 'bacterial',
    severity: 'severe',
    affectedSpecies: ['Tilapia', 'Catfish', 'Clarias'],
    symptoms: [
      'Red haemorrhages on body, fins, base of fins',
      'Pop-eye (exophthalmia), distended belly',
      'Open ulcers, dark patches',
      'Fish hanging at surface, off feed',
    ],
    causes: [
      'Common in stressed fish (low DO, crowding, dirty water)',
      'Wounds (parasites, handling) provide entry point',
      'Outbreaks after temperature shocks or rain events',
    ],
    treatment: [
      'Improve water quality immediately - partial water exchange',
      'Stop feeding for 24–48h to reduce ammonia',
      'Antibiotic-medicated feed 7–10 days (oxytetracycline, florfenicol) - needs vet prescription',
      'Salt 0.3–0.5% in pond aids recovery',
    ],
    prevention: [
      'DO >5 mg/L always; aerate during hot/rainy periods',
      'Reduce density if mortality rises',
      'Quick wound care with potassium permanganate',
      'Avoid mixing batches without quarantine',
    ],
    oneLiner: 'Red sores + pop-eye - emergency water exchange, vet for antibiotics.',
  },
  {
    id: 'saprolegnia',
    name: 'Saprolegnia (Water Mould)',
    scientificName: 'Saprolegnia spp.',
    category: 'fungal',
    severity: 'moderate',
    affectedSpecies: ['Tilapia', 'Catfish', 'Clarias', 'Other Fish'],
    symptoms: [
      'White or grey cotton-like growth on skin, fins, gills',
      'Often appears on wounds first',
      'Affected fish lethargic, may stop eating',
    ],
    causes: [
      'Cool water (<22°C) - common during cold snaps',
      'Skin damage from parasites, handling, or aggression',
      'Poor water quality (organic matter buildup)',
    ],
    treatment: [
      'Salt bath 1–3% (15–30 minutes) repeated daily',
      'Methylene blue 2 ppm bath',
      'Formalin 25 ppm pond treatment (use carefully - toxic to gills)',
      'Improve water clarity, remove decomposing organic matter',
    ],
    prevention: [
      'Maintain water temperature in species optimum range',
      'Treat wounds promptly with potassium permanganate',
      'Regular pond cleaning, avoid feed accumulation',
    ],
    oneLiner: 'Cotton-wool growth - usually means cool/dirty water; salt bath helps.',
  },
  {
    id: 'ich',
    name: 'Ich (White Spot Disease)',
    scientificName: 'Ichthyophthirius multifiliis',
    category: 'parasitic',
    severity: 'moderate',
    affectedSpecies: ['Tilapia', 'Catfish', 'Clarias', 'Other Fish'],
    symptoms: [
      'White spots like grains of salt on skin, fins, gills',
      'Fish flashing (rubbing on pond bottom)',
      'Rapid breathing, gasping at surface (gill irritation)',
      'Loss of appetite',
    ],
    causes: [
      'Parasitic protozoan, free-swimming stage infects new fish',
      'Stress, low temperature, new fish without quarantine',
    ],
    treatment: [
      'Raise temperature to 30°C if species tolerates (speeds parasite life cycle for treatment)',
      'Salt 0.3% (3 g/L) for 7–10 days',
      'Formalin 25 ppm bath (1 hour), 3 treatments 3 days apart',
      'Methylene blue 2 ppm - 5 days',
    ],
    prevention: [
      'Quarantine new fish 14 days at warm water',
      'Avoid temperature stress',
      'Reduce overcrowding',
    ],
    oneLiner: 'White salt-grain spots - raise temp + salt for 7-10 days.',
  },
  {
    id: 'gill-parasites',
    name: 'Trichodina / Gill Parasites',
    category: 'parasitic',
    severity: 'moderate',
    affectedSpecies: ['Tilapia', 'Catfish', 'Clarias'],
    symptoms: [
      'Fish gasping at surface even when DO is fine',
      'Excess mucus on skin and gills',
      'Pale gills, flashing behaviour',
      'Slow growth despite normal feeding',
    ],
    causes: [
      'Trichodina or Chilodonella protozoans',
      'Common in dense, dirty ponds',
      'Stressed fish more vulnerable',
    ],
    treatment: [
      'Formalin 25 ppm - 1 hour bath',
      'Salt 1.5% bath - 30 minutes',
      'Improve water quality',
    ],
    prevention: [
      'Regular partial water changes',
      'Don\'t exceed recommended density',
      'Microscope check during routine health monitoring',
    ],
    oneLiner: 'Gasping despite good DO + excess mucus - likely gill parasites; formalin bath.',
  },
  {
    id: 'anchor-worm',
    name: 'Anchor Worm / Fish Lice',
    scientificName: 'Lernaea spp. (anchor worm) / Argulus spp. (fish lice)',
    category: 'parasitic',
    severity: 'moderate',
    affectedSpecies: ['Tilapia', 'Catfish', 'Clarias'],
    symptoms: [
      'Visible thread-like worms or flat lice on skin/fins',
      'Red ulcers around attachment points',
      'Flashing, irritation behaviour',
    ],
    causes: [
      'Crustacean ectoparasites - common in pond systems',
      'Spread by infested fingerlings or water sources',
    ],
    treatment: [
      'Potassium permanganate 2–4 mg/L pond - kills free-swimming larvae',
      'Manual removal with forceps for severe cases',
      'Diflubenzuron / dimilin (insect growth regulator) - vet only',
    ],
    prevention: [
      'Source fingerlings from clean hatcheries',
      'Quarantine new stock',
      'Treat pond with KMnO4 between cycles',
    ],
    oneLiner: 'Visible worms/lice on skin - KMnO4 treatment + quarantine new fish.',
  },
  {
    id: 'low-do',
    name: 'Dissolved Oxygen Crash',
    category: 'environmental',
    severity: 'fatal',
    affectedSpecies: ['Tilapia', 'Catfish', 'Clarias', 'Other Fish'],
    symptoms: [
      'Mass mortality at dawn - biggest fish die first',
      'Fish gasping at surface, especially morning',
      'Lethargic, off feed in afternoon',
    ],
    causes: [
      'Algae die-off (after cloudy days, after pesticide drift)',
      'Pond turnover after heavy rain (mixes anaerobic bottom)',
      'Overfeeding causing oxygen demand spike',
      'Overstocking',
    ],
    treatment: [
      'Emergency aeration (paddlewheel, air pump, even shaking buckets of water)',
      'Partial water exchange immediately',
      'Stop feeding 24–48h',
      'Move surviving fish to a healthy pond if available',
    ],
    prevention: [
      'Daily DO monitoring at dawn (lowest point)',
      'Don\'t exceed 1 fish/m² in unaerated tilapia ponds',
      'Reduce feed during cloudy weeks',
      'Keep water depth >1.2m (deeper = more oxygen reserve)',
    ],
    oneLiner: 'Dawn mass die-off - DO crash. Aerate now, water exchange, no feed 24h.',
  },
  {
    id: 'ammonia-toxicity',
    name: 'Ammonia Toxicity',
    category: 'environmental',
    severity: 'severe',
    affectedSpecies: ['Tilapia', 'Catfish', 'Clarias', 'Other Fish'],
    symptoms: [
      'Lethargy, loss of appetite',
      'Reddened gills, gasping',
      'Erratic swimming, convulsions in severe cases',
      'Rising mortality especially in young fish',
    ],
    causes: [
      'Overfeeding / uneaten feed decomposition',
      'High pH amplifies toxicity (NH3 form increases above pH 8)',
      'Poor biofilter / new pond not yet cycled',
      'Overstocking',
    ],
    treatment: [
      'Partial water exchange 30–50%',
      'Stop feeding 24–48h, then resume at half rate',
      'Add salt 0.3% (reduces nitrite uptake; doesn\'t directly fix ammonia but reduces stress)',
      'Test pH - if high, consider gypsum to lower slightly',
    ],
    prevention: [
      'Match feed to biomass - don\'t overfeed',
      'Clean uneaten feed within 30 minutes',
      'Cycle new ponds with low stock first',
      'Weekly NH3 test',
    ],
    oneLiner: 'NH3 >0.5 mg/L = toxic. Stop feeding, water exchange.',
  },
  {
    id: 'nitrite-poisoning',
    name: 'Nitrite Poisoning (Brown Blood Disease)',
    category: 'environmental',
    severity: 'severe',
    affectedSpecies: ['Catfish', 'Clarias', 'Tilapia', 'Other Fish'],
    symptoms: [
      'Brown gills (oxidised haemoglobin)',
      'Fish gasping at surface despite normal DO',
      'Lethargy, off feed, dark colouration',
    ],
    causes: [
      'Biofilter not converting nitrite to nitrate',
      'Common in new ponds or after antibiotic treatment that killed beneficial bacteria',
      'Heavy feeding without enough biofilter capacity',
    ],
    treatment: [
      'Add salt 1 g/L (chloride blocks nitrite uptake at gills)',
      'Partial water exchange 30%',
      'Reduce feed by half',
      'Wait for biofilter to recover (1–2 weeks)',
    ],
    prevention: [
      'Cycle pond before stocking',
      'Don\'t use broad-spectrum antibiotics in pond water',
      'Test NO2- weekly during heavy feeding',
    ],
    oneLiner: 'Brown gills + gasping despite good DO - add salt 1 g/L, exchange water.',
  },
  {
    id: 'tilapia-lake-virus',
    name: 'Tilapia Lake Virus (TiLV)',
    scientificName: 'Tilapia tilapinevirus',
    category: 'viral',
    severity: 'fatal',
    affectedSpecies: ['Tilapia'],
    symptoms: [
      'Mass mortality, often >50% in days',
      'Skin lesions, scale loss',
      'Lethargy, abnormal swimming',
      'Eye opacity, swollen abdomen',
    ],
    causes: [
      'Highly contagious viral disease',
      'Spreads via contaminated water, equipment, infected fingerlings',
      'No specific treatment available',
    ],
    treatment: [
      'NO TREATMENT - viral, not curable',
      'Cull and dispose of dead fish properly (bury deep with lime or burn)',
      'Disinfect equipment with iodophor or 10% bleach',
      'Quarantine and stop selling fish from affected pond',
      'Drain and disinfect pond before next cycle (chlorine 30 ppm 24h)',
    ],
    prevention: [
      'Source fingerlings from certified TiLV-free hatcheries',
      'Strict biosecurity - separate equipment per pond',
      'Quarantine new stock 21 days minimum',
      'Report suspected cases to local fisheries authority',
    ],
    oneLiner: 'Mass tilapia die-off + lesions - likely TiLV; quarantine, disinfect, no cure.',
  },
];

export function searchDiseases(query: string): FishDisease[] {
  const q = query.toLowerCase();
  if (!q) return FISH_DISEASES;
  return FISH_DISEASES.filter(d => {
    return (
      d.name.toLowerCase().includes(q) ||
      d.scientificName?.toLowerCase().includes(q) ||
      d.symptoms.some(s => s.toLowerCase().includes(q)) ||
      d.causes.some(c => c.toLowerCase().includes(q)) ||
      d.oneLiner.toLowerCase().includes(q)
    );
  });
}

export function diseasesForSpecies(species: 'Tilapia' | 'Catfish' | 'Clarias' | 'Other Fish'): FishDisease[] {
  return FISH_DISEASES.filter(d => d.affectedSpecies.includes(species));
}
