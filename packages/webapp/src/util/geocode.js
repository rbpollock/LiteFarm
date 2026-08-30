// irl.coop geocoding — Nominatim (OSM), replacing the Google Maps geocoder.
// Self-hosted Nominatim is the later geocoder service (see the maps design);
// until then this uses the public OSM Nominatim — same source LiteFarm already
// uses for reverse geocoding in the API.
const NOMINATIM = import.meta.env.VITE_NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
const HEADERS = { 'User-Agent': 'irlcoop-litefarm/3.13.1' };

// address -> { lat, lng, country, formatted } (null when unresolvable)
export async function forwardGeocode(address) {
  try {
    const url = `${NOMINATIM}/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const results = await res.json();
    const r = results?.[0];
    if (!r) return null;
    return {
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      country: r.address?.country_code?.toUpperCase(),
      formatted: r.display_name,
    };
  } catch (e) {
    console.warn('forward geocode failed:', e?.message);
    return null;
  }
}

// lat/lng -> { country, formatted }
export async function reverseGeocode(lat, lng) {
  try {
    const url = `${NOMINATIM}/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const r = await res.json();
    return {
      country: r.address?.country_code?.toUpperCase(),
      formatted: r.display_name,
    };
  } catch (e) {
    console.warn('reverse geocode failed:', e?.message);
    return null;
  }
}
