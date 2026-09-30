// Maps Google place types onto our default category slugs. The first matching
// rule wins; primaryType is checked before the full types list.
const RULES: [slug: string, test: (t: string) => boolean][] = [
  ["hotel", (t) => ["lodging", "hotel", "resort_hotel", "bed_and_breakfast", "guest_house", "inn", "motel", "hostel", "cottage", "farmstay", "campground", "camping_cabin"].includes(t)],
  ["cafe", (t) => ["cafe", "coffee_shop", "tea_house", "bakery", "cafeteria", "dessert_shop", "ice_cream_shop", "juice_shop"].includes(t)],
  ["bar", (t) => ["bar", "pub", "wine_bar", "cocktail_bar", "night_club", "brewery", "brewpub", "bar_and_grill", "lounge_bar"].includes(t)],
  ["restaurant", (t) => t === "restaurant" || t.endsWith("_restaurant") || ["food_court", "diner", "steak_house", "bistro", "brunch_restaurant"].includes(t)],
  ["day-out", (t) => ["amusement_park", "zoo", "aquarium", "water_park", "national_park", "state_park", "hiking_area", "beach", "farm", "garden", "botanical_garden", "wildlife_park", "adventure_sports_center", "go_karting_venue", "marina", "ski_resort"].includes(t)],
  ["attraction", (t) => ["tourist_attraction", "museum", "art_gallery", "historical_landmark", "historical_place", "monument", "castle", "church", "cultural_landmark", "performing_arts_theater", "park", "observation_deck", "cultural_center"].includes(t)],
  ["shop", (t) => t === "store" || t.endsWith("_store") || ["shopping_mall", "market", "gift_shop", "florist"].includes(t)],
];

export function suggestCategory(
  primaryType: string | null | undefined,
  types: string[],
  available: string[],
): string {
  const has = new Set(available);
  for (const t of [primaryType, ...types].filter(Boolean) as string[]) {
    for (const [slug, test] of RULES) {
      if (has.has(slug) && test(t)) return slug;
    }
  }
  return has.has("other") ? "other" : (available[0] ?? "other");
}

export const STATUS_LABELS = {
  want: "Want to go",
  been: "Been",
  not_interested: "Not interested",
} as const;
