import { apiGet } from "./apiService";

export interface GeoCoords {
  lat: number;
  lon: number;
  accuracy?: "exact_address" | "approximate_zip" | "approximate_city" | "exact" | "zip" | "city";
}

export interface AddressSuggestion {
  displayName: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lon: number;
}

export function geocodeAddress(opts: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): Promise<GeoCoords> {
  return apiGet<GeoCoords>("/geocode/coords", opts);
}

export async function suggestAddresses(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 5) return [];
  const data = await apiGet<{ suggestions?: AddressSuggestion[] }>("/geocode/suggest", { q: query });
  return data.suggestions ?? [];
}
