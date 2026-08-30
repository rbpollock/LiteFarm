import { useEffect, useLayoutEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { showedSpotlightSelector } from '../showedSpotlightSlice';
import { isArea, isLine, isPoint, locationEnum, polygonPath } from './constants';
import { fieldEnum } from '../constants';
import { hookFormPersistSelector } from '../hooks/useHookFormPersist/hookFormPersistSlice';
import { area as turfArea } from '@turf/area';
import { length as turfLength } from '@turf/length';
import {
  polygon as turfPolygon,
  lineString as turfLineString,
  point as turfPoint,
} from '@turf/helpers';

/**
 * irl.coop: drawing state reworked onto raw GeoJSON (TerraDraw's native model).
 * The drawn shape is a { type, coordinates, feature } record ([lng, lat] order);
 * there is no google.maps overlay to hide/show/edit — the map container renders
 * drawingToCheck + widthPolygon as GeoJSON sources. "Adjust shape" is now
 * re-draw (TerraDraw), which is strictly better than the old un-editable drag.
 */
export default function useDrawingManager() {
  const [drawingManager, setDrawingManager] = useState(null);
  const [widthPolygon, setWidthPolygon] = useState(null); // [lng, lat][] ring
  const [lineWidth, setLineWidth] = useState(null);
  const [drawLocationType, setDrawLocationType] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingToCheck, setDrawingToCheck] = useState(null); // DrawnOverlay | null

  const [onBackPressed, setOnBackPressed] = useState(false);
  const [onSteppedBack, setOnSteppedBack] = useState(false);

  const [showZeroAreaWarning, setZeroAreaWarning] = useState(false);
  const [showZeroLengthWarning, setShowZeroLengthWarning] = useState(false);
  const [showAdjustAreaSpotlightModal, setShowAdjustAreaSpotlightModal] = useState(false);
  const [showAdjustLineSpotlightModal, setShowAdjustLineSpotlightModal] = useState(false);

  const [pointChanged, setPointChanged] = useState(false);

  const showedSpotlight = useSelector(showedSpotlightSelector);
  const overlayData = useSelector(hookFormPersistSelector);

  useEffect(() => {
    if (onBackPressed) {
      setDrawingToCheck(null);
      setWidthPolygon(null);
      setOnBackPressed(false);
    }
  }, [onBackPressed]);

  // Compute the width polygon for lines that carry a buffer/width (watercourse,
  // buffer_zone) via the turf port of the old google.maps polygonPath.
  useEffect(() => {
    if (
      drawingToCheck?.type === 'polyline' &&
      [locationEnum.watercourse, locationEnum.buffer_zone].includes(drawLocationType) &&
      !!lineWidth &&
      drawingToCheck.coordinates.length > 1
    ) {
      setWidthPolygon(polygonPath(drawingToCheck.coordinates, Number(lineWidth)));
    } else if (widthPolygon !== null) {
      setWidthPolygon(null);
    }
  }, [drawingToCheck, lineWidth]);

  // Reconstruct a previously-drawn shape when stepping back from the form.
  useEffect(() => {
    if (!onSteppedBack) return;
    const { type } = overlayData;
    setDrawLocationType(type);
    setIsDrawing(false);
    if (isArea(type)) {
      const coords = overlayData.grid_points.map(({ lat, lng }) => [lng, lat]);
      setDrawingToCheck({
        type: 'polygon',
        coordinates: coords,
        feature: turfPolygon([[...coords, coords[0]]]),
      });
    } else if (isLine(type)) {
      setLineWidth(overlayData.width);
      const coords = overlayData.line_points.map(({ lat, lng }) => [lng, lat]);
      setDrawingToCheck({
        type: 'polyline',
        coordinates: coords,
        feature: turfLineString(coords),
      });
    } else if (isPoint(type)) {
      const [lng, lat] = [overlayData.point.lng, overlayData.point.lat];
      setDrawingToCheck({
        type: 'point',
        coordinates: [[lng, lat]],
        feature: turfPoint([lng, lat]),
      });
    }
    return () => {
      if (!onSteppedBack) return;
      setOnSteppedBack(false);
    };
  }, [onSteppedBack, overlayData]);

  useLayoutEffect(() => {
    if (drawingToCheck) {
      if (isArea(drawLocationType) && !showedSpotlight.adjust_area && !showZeroAreaWarning)
        setShowAdjustAreaSpotlightModal(true);
      if (isLine(drawLocationType) && !showedSpotlight.adjust_line && !showZeroLengthWarning)
        setShowAdjustLineSpotlightModal(true);
    } else {
      setShowAdjustAreaSpotlightModal(false);
      setShowAdjustLineSpotlightModal(false);
    }
  }, [drawingToCheck, showZeroAreaWarning, showZeroLengthWarning]);

  const initDrawingState = (drawingManagerInit) => {
    setDrawingManager(drawingManagerInit);
  };

  const startDrawing = (type) => {
    setDrawLocationType(type);
    setIsDrawing(true);
    drawingManager.setMode(type);
  };

  const finishDrawing = (drawing) => {
    setIsDrawing(false);
    setDrawingToCheck(drawing);
  };

  const resetDrawing = (wasBackPressed = false) => {
    if (wasBackPressed) setOnSteppedBack(false);
    setOnBackPressed(wasBackPressed);
    setDrawingToCheck(null);
    setWidthPolygon(null);
  };

  const closeDrawer = () => {
    setIsDrawing(false);
    setDrawLocationType(null);
    drawingManager.setMode(null);
  };

  const getOverlayInfo = () => {
    if (isArea(drawLocationType)) {
      const ring = [...drawingToCheck.coordinates, drawingToCheck.coordinates[0]];
      const geom = turfPolygon([ring]);
      const grid_points = drawingToCheck.coordinates.map(([lng, lat]) => ({ lat, lng }));
      const totalArea = Math.round(turfArea(geom));
      const perimeter = Math.round(turfLength(turfLineString(ring)));
      return { type: drawLocationType, grid_points, total_area: totalArea, perimeter };
    }
    if (isLine(drawLocationType)) {
      const line_points = drawingToCheck.coordinates.map(([lng, lat]) => ({ lat, lng }));
      const lineLength = Math.round(turfLength(turfLineString(drawingToCheck.coordinates)));
      let total_area = null;
      if (widthPolygon) {
        total_area = Math.round(turfArea(turfPolygon([[...widthPolygon, widthPolygon[0]]])));
      }
      return { type: drawLocationType, line_points, length: lineLength, total_area };
    }
    if (isPoint(drawLocationType)) {
      const [lng, lat] = drawingToCheck.coordinates[0];
      return { type: drawLocationType, point: { lat, lng } };
    }
  };

  const reconstructOverlay = () => {
    setOnSteppedBack(true);
  };

  const drawingState = {
    type: drawLocationType,
    isActive: isDrawing,
    drawingManager,
    drawingToCheck,
    widthPolygon,
    showAdjustAreaSpotlightModal,
    showAdjustLineSpotlightModal,
    showZeroLengthWarning,
    showZeroAreaWarning,
    pointChanged,
  };

  const drawingFunctions = {
    initDrawingState,
    startDrawing,
    finishDrawing,
    resetDrawing,
    closeDrawer,
    getOverlayInfo,
    reconstructOverlay,
    setLineWidth,
    setShowAdjustAreaSpotlightModal,
    setShowAdjustLineSpotlightModal,
    setZeroAreaWarning,
    setShowZeroLengthWarning,
  };

  return [drawingState, drawingFunctions];
}
