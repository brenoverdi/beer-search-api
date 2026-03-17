// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeminiResult {
  beer_name: string;
  brewery: string;
  style: string;
  abv: number | null;
  rating_score: number | null;
  rating_count: number | null;
  description: string | null;
}

export interface NormalizedBeer {
  id: string;
  query: string;
  beer_name: string;
  brewery: string;
  style: string;
  abv: number | null;
  ibu: number | null;
  check_ins: number | null;
  rating_score: number | null;
  rating_count: number | null;
  description: string | null;
}

export type SearchSource = 'single' | 'list' | 'image' | 'url';

export interface SearchResponse {
  source: SearchSource;
  beerNames: string[];
  results: NormalizedBeer[];
}

export const POPULAR_NAMES = [
  'Westvleteren 12',
  'Pliny the Elder',
  'Heady Topper',
  'Founders KBS',
  'Russian River Consecration',
  'Trappistes Rochefort 10',
  "Bell's Hopslam",
  'Sierra Nevada Celebration',
  'Dogfish Head 120 Minute IPA',
  'Allagash White',
];
