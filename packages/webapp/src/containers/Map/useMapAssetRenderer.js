/*
 *  Copyright 2019, 2020, 2021, 2022 LiteFarm.org
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

// irl.coop: asset rendering reworked from google.maps overlays to MapLibre
// GeoJSON sources/layers. Locations are grouped into a single FeatureCollection
// (asset: 'area' | 'line' | 'point') with the farm pin as a MapLibre Marker.
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useDispatch, useSelector } from 'react-redux';
import { mapFilterSettingSelector } from './mapFilterSettingSlice';
import { setPosition, setZoomLevel } from '../mapSlice';
import { isArea, isAreaLine, isLine } from './constants';
import useSelectionHandler from './useSelectionHandler';
import { areaStyles, lineStyles } from './mapStyles';
import { defaultColour } from './styles.module.scss';
import MapPin from '../../assets/images/map/map_pin.svg';
import { userFarmSelector } from '../userFarmSlice';
import { usePropRef } from '../../components/LocationPicker/SingleLocationPicker/usePropRef';
import useLocations from '../../hooks/location/useLocations';
import useExternalLocations from '../../hooks/location/useExternalLocations';
import { GroupByOptions } from '../../hooks/location/types';
import {
  featureCollection,
  polygon as turfPolygon,
  lineString as turfLineString,
  point as turfPoint,
} from '@turf/helpers';

const SOURCE_ID = 'farm-assets';
const AREA_FILL = 'assets-area-fill';
const AREA_OUTLINE = 'assets-area-outline';
const LINE = 'assets-line';
const POINT = 'assets-point';

// Build a GeoJSON FeatureCollection + a parallel per-type record of hit-testable
// records ({ feature, visible, location_id, location_name, type, asset, ... }).
const buildAssets = (areaAssets, lineAssets, pointAssets, filterSettings) => {
  const features = [];
  const assetGeometries = {};

  const colourFor = (type, isAreaType) =>
    isAreaType ? areaStyles[type]?.colour || defaultColour : lineStyles[type]?.colour || defaultColour;

  Object.entries(areaAssets || {}).forEach(([type, list]) => {
    (list || []).forEach((area) => {
      const coords = (area.grid_points || []).map(({ lat, lng }) => [lng, lat]);
      if (coords.length < 3) return;
      const feature = turfPolygon([[...coords, coords[0]]], {
        asset: 'area',
        location_id: area.location_id,
        name: area.name,
        type,
        colour: areaStyles[type]?.colour || defaultColour,
        isVisible: filterSettings?.[type] ?? true,
      });
      features.push(feature);
      (assetGeometries[type] ||= []).push({
        feature,
        visible: filterSettings?.[type] ?? true,
        location_id: area.location_id,
        location_name: area.name,
        asset: 'area',
        type,
      });
    });
  });

  Object.entries(lineAssets || {}).forEach(([type, list]) => {
    (list || []).forEach((line) => {
      const coords = (line.line_points || []).map(({ lat, lng }) => [lng, lat]);
      if (coords.length < 2) return;
      const feature = turfLineString(coords, {
        asset: 'line',
        location_id: line.location_id,
        name: line.name,
        type,
        colour: lineStyles[type]?.colour || defaultColour,
        isVisible: filterSettings?.[type] ?? true,
      });
      features.push(feature);
      (assetGeometries[type] ||= []).push({
        feature,
        visible: filterSettings?.[type] ?? true,
        location_id: line.location_id,
        location_name: line.name,
        asset: 'line',
        type,
      });
    });
  });

  Object.entries(pointAssets || {}).forEach(([type, list]) => {
    (list || []).forEach((point) => {
      if (!point.point) return;
      const feature = turfPoint([point.point.lng, point.point.lat], {
        asset: 'point',
        location_id: point.location_id,
        name: point.name,
        type,
        colour: defaultColour,
        isVisible: filterSettings?.[type] ?? true,
      });
      features.push(feature);
      (assetGeometries[type] ||= []).push({
        feature,
        visible: filterSettings?.[type] ?? true,
        location_id: point.location_id,
        location_name: point.name,
        asset: 'point',
        type,
        isAddonSensor: point.isAddonSensor,
      });
    });
  });

  return { features, assetGeometries };
};

const useMapAssetRenderer = ({ map, isClickable, showingConfirmButtons, drawingState }) => {
  const { handleSelection, dismissSelectionModal } = useSelectionHandler();
  const dispatch = useDispatch();
  const filterSettings = useSelector(mapFilterSettingSelector);

  const {
    locations: internalLocations,
    isLoading: isLoadingInternalLocations,
    isFetching: isFetchingInternalLocations,
  } = useLocations({ groupBy: GroupByOptions.FIGURE_AND_TYPE });
  const {
    locations: externalLocations,
    isLoading: isLoadingExternalLocations,
    isFetching: isFetchingExternalLocations,
  } = useExternalLocations({ groupBy: GroupByOptions.FIGURE_AND_TYPE });

  const areaAssets = { ...internalLocations?.area, ...externalLocations?.area };
  const lineAssets = { ...internalLocations?.line, ...externalLocations?.line };
  const pointAssets = { ...internalLocations?.point, ...externalLocations?.point };

  const { grid_points } = useSelector(userFarmSelector);

  const { features, assetGeometries } = useMemo(
    () => buildAssets(areaAssets, lineAssets, pointAssets, filterSettings),
    [JSON.stringify(areaAssets), JSON.stringify(lineAssets), JSON.stringify(pointAssets)],
  );

  const assetGeometriesRef = useRef(assetGeometries);
  useEffect(() => {
    assetGeometriesRef.current = assetGeometries;
  }, [assetGeometries]);

  const locationsRef = usePropRef([]);
  const farmPinRef = useRef(null);
  const [farmMap, setFarmMap] = useState(null);

  // Add the source + layers once the map is ready.
  useEffect(() => {
    if (!map) return;
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: featureCollection(features),
    });

    map.addLayer({
      id: AREA_FILL,
      type: 'fill',
      source: SOURCE_ID,
      filter: ['==', ['get', 'asset'], 'area'],
      paint: {
        'fill-color': ['get', 'colour'],
        'fill-opacity': 0.5,
      },
    });
    map.addLayer({
      id: AREA_OUTLINE,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'asset'], 'area'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': defaultColour, 'line-width': 2, 'line-dasharray': [0.5, 1.5] },
    });
    map.addLayer({
      id: LINE,
      type: 'line',
      source: SOURCE_ID,
      filter: ['==', ['get', 'asset'], 'line'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'colour'], 'line-width': 2, 'line-dasharray': [0.5, 1.5] },
    });
    map.addLayer({
      id: POINT,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['==', ['get', 'asset'], 'point'],
      paint: {
        'circle-radius': 6,
        'circle-color': ['get', 'colour'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });

    const clickLayers = [AREA_FILL, AREA_OUTLINE, LINE, POINT];
    const onClick = (e) => {
      if (!isClickable) return;
      const [lng, lat] = [e.lngLat.lng, e.lngLat.lat];
      dispatch(setPosition({ lat, lng }));
      dispatch(setZoomLevel(map.getZoom()));
      // Only the clicked feature's type matters; hit-test against all records.
      handleSelection([lng, lat], assetGeometriesRef.current, true);
    };
    clickLayers.forEach((layer) => map.on('click', layer, onClick));

    map.on('mouseenter', [AREA_FILL], () => map.setPaintProperty(AREA_FILL, 'fill-opacity', 0.8));
    map.on('mouseleave', [AREA_FILL], () => map.setPaintProperty(AREA_FILL, 'fill-opacity', 0.5));
    map.on('mouseenter', [LINE], () => map.setPaintProperty(LINE, 'line-width', 4));
    map.on('mouseleave', [LINE], () => map.setPaintProperty(LINE, 'line-width', 2));

    return () => {
      clickLayers.forEach((layer) => map.off('click', layer, onClick));
    };
  }, [map, isClickable]);

  // Update the source data when locations change.
  useEffect(() => {
    if (map && map.getSource(SOURCE_ID)) {
      map.getSource(SOURCE_ID).setData(featureCollection(features));
    }
  }, [JSON.stringify(features)]);

  // Farm pin (a MapLibre Marker at the farm's grid point).
  useEffect(() => {
    if (!map || !grid_points) return;
    if (!farmPinRef.current) {
      farmPinRef.current = new maplibregl.Marker({ element: makePinElement() })
        .setLngLat([grid_points.lng, grid_points.lat])
        .addTo(map);
    } else {
      farmPinRef.current.setLngLat([grid_points.lng, grid_points.lat]);
    }
    setFarmMap(map);
    return () => {
      farmPinRef.current?.remove();
      farmPinRef.current = null;
    };
  }, [map, grid_points?.lat, grid_points?.lng]);

  // Hide the farm pin while drawing.
  useEffect(() => {
    const visible = !drawingState.isActive && !showingConfirmButtons;
    const el = farmPinRef.current?.getElement?.();
    if (el) el.style.display = visible ? '' : 'none';
  }, [drawingState.isActive, showingConfirmButtons]);

  return {
    isFetchingInternalLocations,
    isLoadingExternalLocations,
    assetGeometries,
    assetGeometriesRef,
  };
};

function makePinElement() {
  const el = document.createElement('img');
  el.src = MapPin;
  el.style.width = '28px';
  el.style.height = '28px';
  return el;
}

export default useMapAssetRenderer;
