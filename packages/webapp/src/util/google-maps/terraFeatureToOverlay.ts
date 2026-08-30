/*
 *  Copyright 2026 LiteFarm.org
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

// irl.coop: the drawn shape is now a raw GeoJSON feature (TerraDraw works in
// GeoJSON natively). Styling is applied via MapLibre layers, not per-overlay
// options, so this conversion no longer needs a Google Maps reference.
import type { GeoJSONStoreFeatures, GeoJSONStoreGeometries } from 'terra-draw';

export type DrawnOverlay = {
  type: 'polygon' | 'polyline' | 'point';
  // GeoJSON coordinates ([lng, lat] pairs — ring for polygon, path for line).
  coordinates: number[][];
  feature: GeoJSONStoreFeatures<GeoJSONStoreGeometries>;
};

export const terraFeatureToOverlay = (
  feature: GeoJSONStoreFeatures<GeoJSONStoreGeometries>,
  locationType: string,
): DrawnOverlay | null => {
  const { geometry } = feature;

  if (geometry.type === 'Polygon') {
    return { type: 'polygon', coordinates: geometry.coordinates[0], feature };
  }
  if (geometry.type === 'LineString') {
    return { type: 'polyline', coordinates: geometry.coordinates, feature };
  }
  if (geometry.type === 'Point') {
    return { type: 'point', coordinates: [geometry.coordinates], feature };
  }

  return null;
};
