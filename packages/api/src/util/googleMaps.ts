/*
 *  Copyright 2025 LiteFarm.org
 *  This file is part of LiteFarm.
 *
 *  LiteFarm is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  LiteFarm is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 *  GNU General Public License for more details, see <https://www.gnu.org/licenses/>.
 */

import axios from 'axios';

// irl.coop: geocoding via Nominatim (OSM), replacing the Google Maps Geocoding
// API. Keeps the same exported names/signatures so callers are unchanged.
const NOMINATIM = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
const HEADERS = { 'User-Agent': 'irlcoop-litefarm/3.13.1' };

export interface ParsedAddress {
  street?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
}

// Forward geocode (address -> {lat, lng, address components}).
export async function nominatimSearch(address: string) {
  const { data } = await axios.get(`${NOMINATIM}/search`, {
    params: { q: address, format: 'json', addressdetails: 1, limit: 1 },
    headers: HEADERS,
  });
  return Array.isArray(data) ? data : [];
}

// Reverse geocode (lat/lng -> address + components).
export async function nominatimReverse(lat: number, lng: number) {
  const { data } = await axios.get(`${NOMINATIM}/reverse`, {
    params: { lat, lon: lng, format: 'json', addressdetails: 1 },
    headers: HEADERS,
  });
  return data;
}

// Kept for the existing callers (validation.ts checks truthiness).
export async function getAddressComponents(address: string) {
  try {
    const results = await nominatimSearch(address);
    return results[0]?.address ?? null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

// Kept for the existing callers (dfcAdapter.ts). Maps Nominatim's `address`
// object to the same ParsedAddress shape the Google implementation returned.
export const parseGoogleGeocodedAddress = async (address: string): Promise<ParsedAddress> => {
  const addr = (await getAddressComponents(address)) as Record<string, string> | null;
  if (!addr) return {};
  return {
    street: addr.road
      ? `${addr.house_number ? addr.house_number + ' ' : ''}${addr.road}`
      : addr.neighbourhood,
    postalCode: addr.postcode,
    city: addr.city ?? addr.town ?? addr.village ?? addr.hamlet,
    region: addr.state,
    country: addr.country,
    countryCode: addr.country_code?.toUpperCase(),
  };
};
