import { isArea, isAreaLine, isLine, isPoint, locationEnum } from './constants';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { canShowSelection, canShowSelectionSelector, locations } from '../mapSlice';
import { useDispatch, useSelector } from 'react-redux';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { pointToLineDistance } from '@turf/point-to-line-distance';
import { distance as turfDistance } from '@turf/distance';
import { point as turfPoint } from '@turf/helpers';

/**
 * irl.coop: hit-testing reworked onto GeoJSON + turf. `handleSelection` takes a
 * [lng, lat] click coordinate and the asset feature records ({ feature, visible,
 * location_id, location_name, type, asset, isAddonSensor }), replacing the old
 * google.maps containsLocation/isLocationOnEdge/marker-position checks.
 */
const useSelectionHandler = () => {
  const history = useHistory();
  const initOverlappedLocations = {
    area: [],
    line: [],
    point: [],
  };

  const dispatch = useDispatch();
  const [overlappedLocations, setOverlappedLocations] = useState(initOverlappedLocations);

  const [dismissSelection, setDismissSelection] = useState(false);
  const showSelection = useSelector(canShowSelectionSelector);

  useEffect(() => {
    if (showSelection) {
      dispatch(canShowSelection(false));
    }
    if (dismissSelection) {
      setOverlappedLocations(structuredClone(initOverlappedLocations));
      setDismissSelection(false);
      return;
    }
    if (
      overlappedLocations.area.length > 0 ||
      overlappedLocations.line.length > 0 ||
      overlappedLocations.point.length > 0
    ) {
      if (
        overlappedLocations.area.length === 1 &&
        overlappedLocations.line.length === 0 &&
        overlappedLocations.point.length === 0
      ) {
        history.push(
          `/${overlappedLocations.area[0].type}/${overlappedLocations.area[0].id}/details`,
        );
      } else if (
        overlappedLocations.area.length === 0 &&
        overlappedLocations.line.length === 1 &&
        overlappedLocations.point.length === 0
      ) {
        history.push(
          `/${overlappedLocations.line[0].type}/${overlappedLocations.line[0].id}/details`,
        );
      } else {
        if (overlappedLocations.point.length === 1) {
          if (
            overlappedLocations.point[0].type === locationEnum.sensor &&
            overlappedLocations.point[0].preview
          ) {
            const locationArray = [];
            overlappedLocations.point.forEach((point) => {
              if (locationArray.length < 4) locationArray.push(point);
            });
            dispatch(canShowSelection(true));
            dispatch(locations(locationArray));
          } else if (
            overlappedLocations.point[0].isAddonSensor &&
            [locationEnum.sensor_array, locationEnum.sensor].includes(
              overlappedLocations.point[0].type,
            )
          ) {
            history.push(
              `/${overlappedLocations.point[0].type}/${overlappedLocations.point[0].id}`,
            );
          } else {
            history.push(
              `/${overlappedLocations.point[0].type}/${overlappedLocations.point[0].id}/details`,
            );
          }
        } else {
          const locationArray = [];
          overlappedLocations.point.forEach((point) => {
            locationArray.push(point);
          });
          overlappedLocations.line.forEach((line) => {
            locationArray.push(line);
          });
          overlappedLocations.area.forEach((area) => {
            locationArray.push(area);
          });
          dispatch(canShowSelection(true));
          dispatch(locations(locationArray));
        }
      }
    }
  }, [overlappedLocations, dismissSelection]);

  const handleSelection = (coordinates, locationAssets, isLocationAsset) => {
    const overlappedLocationsCopy = structuredClone(initOverlappedLocations);
    if (isLocationAsset) {
      Object.keys(locationAssets).map((locationType) => {
        if (isArea(locationType)) {
          locationAssets[locationType].forEach((area) => {
            if (
              area.visible &&
              area.feature &&
              booleanPointInPolygon(turfPoint(coordinates), area.feature)
            ) {
              overlappedLocationsCopy.area.push({
                id: area.location_id,
                name: area.location_name,
                asset: area.asset,
                type: area.type,
              });
            }
          });
        } else if (isAreaLine(locationType) || isLine(locationType)) {
          locationAssets[locationType].forEach((line) => {
            if (
              line.visible &&
              line.feature &&
              pointToLineDistance(turfPoint(coordinates), line.feature, { units: 'meters' }) <
                (isAreaLine(locationType) ? 30 : 11)
            ) {
              overlappedLocationsCopy.line.push({
                id: line.location_id,
                name: line.location_name,
                asset: line.asset,
                type: line.type,
              });
            }
          });
        } else if (isPoint(locationType)) {
          locationAssets[locationType].forEach((point) => {
            if (
              point.visible &&
              point.feature &&
              turfDistance(turfPoint(coordinates), turfPoint(point.feature.geometry.coordinates), {
                units: 'meters',
              }) < 20
            ) {
              overlappedLocationsCopy.point.push({
                id: point.location_id,
                name: point.location_name,
                asset: point.asset,
                type: point.type,
                isAddonSensor: point.isAddonSensor,
              });
            }
          });
        }
      });
      setOverlappedLocations(structuredClone(overlappedLocationsCopy));
    } else {
      setDismissSelection(true);
      dispatch(canShowSelection(false));
    }
  };

  const dismissSelectionModal = () => setDismissSelection(true);

  return { handleSelection, dismissSelectionModal };
};

export default useSelectionHandler;
