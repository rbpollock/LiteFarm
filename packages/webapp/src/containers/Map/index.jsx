import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';
import { useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './styles.module.scss';
import { saveAs } from 'file-saver';
import { DEFAULT_CENTER, DEFAULT_ZOOM, isArea, isLine, locationEnum } from './constants';
import { useDispatch, useSelector } from 'react-redux';
import { measurementSelector, userFarmSelector } from '../userFarmSlice';
import html2canvas from 'html2canvas';
import { sendMapToEmail, setSpotlightToShown } from './saga';
import {
  canShowSuccessHeader,
  setShowSuccessHeaderSelector,
  setSuccessMessageSelector,
} from '../mapSlice';
import { showedSpotlightSelector } from '../showedSpotlightSlice';

import PureMapHeader from '../../components/Map/Header';
import { PureSnackbarWithoutBorder } from '../../components/PureSnackbar';
import PureMapFooter from '../../components/Map/Footer';
import { LoadingBackdrop } from '../../components/Loading/LoadingV2';
import ExportMapModal from '../../components/Modals/ExportMapModal';
import DrawAreaModal from '../../components/Map/Modals/DrawArea';
import DrawLineModal from '../../components/Map/Modals/DrawLine';
import AdjustAreaModal from '../../components/Map/Modals/AdjustArea';
import AdjustLineModal from '../../components/Map/Modals/AdjustLine';
import CustomZoom from '../../components/Map/CustomZoom';
import CustomCompass from '../../components/Map/CustomCompass';
import DrawingManager from '../../components/Map/DrawingManager';
import useDrawingManager from './useDrawingManager';
import { createShapeCapture } from './createShapeCapture';
import useMapAssetRenderer from './useMapAssetRenderer';
import {
  mapFilterSettingSelector,
  setMapFilterHideAll,
  setMapFilterSetting,
  setMapFilterShowAll,
  isMapFilterSettingActiveSelector,
} from './mapFilterSettingSlice';
import {
  hookFormPersistedPathsSetSelector,
  hookFormPersistSelector,
  resetAndUnLockFormData,
  setPersistedPaths,
  upsertFormData,
  setIsRedrawing,
  hookFormPersistIsRedrawingSelector,
} from '../hooks/useHookFormPersist/hookFormPersistSlice';
import LocationSelectionModal from './LocationSelectionModal';
import { useMaxZoom } from './useMaxZoom';
import {
  mapAddDrawerSelector,
  setMapAddDrawerHide,
  setMapAddDrawerShow,
} from './mapAddDrawerSlice';
import clsx from 'clsx';
import { ADD_SENSORS_URL } from '../../util/siteMapConstants';
import useAvailableFilterSettings from './useAvailableFilterSettings';
import { useIsOffline } from '../hooks/useOfflineDetector/useIsOffline';
import { area as turfArea } from '@turf/area';
import { length as turfLength } from '@turf/length';
import { polygon as turfPolygon, lineString as turfLineString } from '@turf/helpers';

const TILES = 'https://s3api.irl.coop/maps/coverage.pmtiles';
const STYLE = {
  version: 8,
  glyphs: 'https://maps.irl.coop/glyphs/{fontstack}/{range}.pbf',
  sources: {
    basemap: { type: 'vector', url: `pmtiles://${TILES}`, maxzoom: 14 },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f5f0e6' } },
    { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': '#a9c8dc' } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'landcover',
      filter: ['in', 'class', 'wood', 'grass', 'grassland'],
      paint: { 'fill-color': '#d7e0c4', 'fill-opacity': 0.7 },
    },
    {
      id: 'roads',
      type: 'line',
      source: 'basemap',
      'source-layer': 'transportation',
      filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary'],
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 14, 5] },
    },
    {
      id: 'buildings',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'building',
      paint: { 'fill-color': '#d9d0c0', 'fill-opacity': 0.6 },
    },
  ],
};

const DRAWING_SOURCE = 'drawing-source';

export default function Map({ isCompactSideMenu }) {
  const history = useHistory();
  const { farm_name, grid_points, is_admin, farm_id } = useSelector(userFarmSelector);
  const filterSettings = useSelector(mapFilterSettingSelector);
  const mapAddDrawer = useSelector(mapAddDrawerSelector);
  const isMapFilterSettingActive = useSelector(isMapFilterSettingActiveSelector);
  const showedSpotlight = useSelector(showedSpotlightSelector);
  const roadview = !filterSettings.map_background;
  const dispatch = useDispatch();
  const system = useSelector(measurementSelector);
  const overlayData = useSelector(hookFormPersistSelector);
  const isRedrawing = useSelector(hookFormPersistIsRedrawingSelector);

  const lineTypesWithWidth = [locationEnum.buffer_zone, locationEnum.watercourse];
  const { t } = useTranslation();
  const showHeader = useSelector(setShowSuccessHeaderSelector);
  const [showSuccessHeader, setShowSuccessHeader] = useState(false);
  const successMessage = useSelector(setSuccessMessageSelector);

  const [showingConfirmButtons, setShowingConfirmButtons] = useState(
    history?.location?.state?.hideLocationPin ?? false,
  );

  const isOffline = useIsOffline();

  const initialLineData = {
    [locationEnum.watercourse]: { width: 1, buffer_width: 15 },
    [locationEnum.buffer_zone]: { width: 8 },
  };
  const persistedPathsSet = useSelector(hookFormPersistedPathsSetSelector);
  useEffect(() => {
    return () => {
      persistedPathsSet.size &&
        !persistedPathsSet.has(history.location.pathname) &&
        dispatch(resetAndUnLockFormData());
    };
  }, [persistedPathsSet]);
  useEffect(() => {
    if (!history.location.state?.isStepBack) {
      dispatch(resetAndUnLockFormData());
    }
    return () => {
      dispatch(canShowSuccessHeader(false));
      dispatch(setMapAddDrawerHide(farm_id));
    };
  }, []);

  const [
    drawingState,
    {
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
    },
  ] = useDrawingManager();

  useEffect(() => {
    if (drawingState.pointChanged) dispatch(setIsRedrawing(true));
  }, [drawingState.pointChanged]);

  useEffect(() => {
    if (showHeader) setShowSuccessHeader(true);
  }, [showHeader]);

  const showAddDrawer = mapAddDrawer.addDrawer && !isOffline;

  const [showMapFilter, setShowMapFilter] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDrawAreaSpotlightModal, setShowDrawAreaSpotlightModal] = useState(false);
  const [showDrawLineSpotlightModal, setShowDrawLineSpotlightModal] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const isClickable = !drawingState.type;

  const { isFetchingInternalLocations, isLoadingExternalLocations } = useMapAssetRenderer({
    map: mapRef.current,
    isClickable,
    showingConfirmButtons,
    drawingState,
  });

  const { getMaxZoom } = useMaxZoom();

  // irl.coop: TerraDraw 'finish' yields a GeoJSON DrawnOverlay; validate area /
  // length with turf and hand it to the drawing manager.
  const handleShapeFinished = (drawing) => {
    if (drawing.type === 'polygon') {
      const areaSqM = turfArea(turfPolygon([[...drawing.coordinates, drawing.coordinates[0]]]));
      if (Math.round(areaSqM) === 0) {
        setZeroAreaWarning(true);
        setShowAdjustAreaSpotlightModal(false);
      } else {
        setZeroAreaWarning(false);
      }
    } else if (drawing.type === 'polyline') {
      const lineLength = turfLength(turfLineString(drawing.coordinates));
      if (Math.round(lineLength) === 0) {
        setShowZeroLengthWarning(true);
        setShowAdjustLineSpotlightModal(false);
      } else {
        setShowZeroLengthWarning(false);
      }
    }
    setShowingConfirmButtons(true);
    finishDrawing(drawing);
    dispatch(setMapAddDrawerHide(farm_id));
  };

  // Init the MapLibre map + TerraDraw drawing once.
  useEffect(() => {
    const node = mapContainerRef.current;
    if (!node) return; // container not mounted yet — should not happen (div is unconditional)
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    const map = new maplibregl.Map({
      container: node,
      style: STYLE,
      center: grid_points?.lng != null ? [grid_points.lng, grid_points.lat] : [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      maxZoom: 20,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on('load', () => {
      const capture = createShapeCapture(map, handleShapeFinished);
      initDrawingState(capture);
      getMaxZoom(null, null);
      setMapReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Render the drawn shape + width polygon as GeoJSON once the map is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource(DRAWING_SOURCE)) {
      map.addSource(DRAWING_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'drawing-fill', type: 'fill', source: DRAWING_SOURCE, filter: ['==', ['get', 'kind'], 'draw'], paint: { 'fill-color': '#2f7d32', 'fill-opacity': 0.3 } });
      map.addLayer({ id: 'drawing-outline', type: 'line', source: DRAWING_SOURCE, filter: ['==', ['get', 'kind'], 'draw'], paint: { 'line-color': '#2f7d32', 'line-width': 2 } });
      map.addLayer({ id: 'drawing-width-fill', type: 'fill', source: DRAWING_SOURCE, filter: ['==', ['get', 'kind'], 'width'], paint: { 'fill-color': '#2f7d32', 'fill-opacity': 0.2 } });
    }
    const features = [];
    if (drawingState.drawingToCheck?.feature) {
      const f = drawingState.drawingToCheck.feature;
      f.properties = { ...(f.properties || {}), kind: 'draw' };
      features.push(f);
    }
    if (drawingState.widthPolygon) {
      features.push(turfPolygon([[...drawingState.widthPolygon, drawingState.widthPolygon[0]]], { kind: 'width' }));
    }
    map.getSource(DRAWING_SOURCE).setData({ type: 'FeatureCollection', features });
  }, [mapReady, drawingState.drawingToCheck, drawingState.widthPolygon]);

  const handleClickAdd = () => {
    setShowExportModal(false);
    setShowMapFilter(false);
    dispatch(showAddDrawer ? setMapAddDrawerHide(farm_id) : setMapAddDrawerShow(farm_id));
  };

  const handleClickExport = () => {
    setShowExportModal(!showExportModal);
    setShowMapFilter(false);
    dispatch(setMapAddDrawerHide(farm_id));
  };

  const handleClickFilter = () => {
    setShowExportModal(false);
    dispatch(setMapAddDrawerHide(farm_id));
    setShowMapFilter(!showMapFilter);
  };

  const handleFilterMenuClick = (locationType) => {
    if (locationType === 'show_all') {
      dispatch(setMapFilterShowAll(farm_id));
    } else if (locationType === 'hide_all') {
      dispatch(setMapFilterHideAll(farm_id));
    } else {
      const payload = {};
      payload[locationType] = !filterSettings[locationType];
      payload.farm_id = farm_id;
      dispatch(setMapFilterSetting(payload));
    }
  };

  const availableFilterSettings = useAvailableFilterSettings();

  const handleAddMenuClick = (locationType) => {
    setZeroAreaWarning(false);
    setShowZeroLengthWarning(false);
    if (isArea(locationType) && !showedSpotlight.draw_area) {
      setShowDrawAreaSpotlightModal(true);
    } else if (isLine(locationType) && !showedSpotlight.draw_line) {
      setShowDrawLineSpotlightModal(true);
    } else if (locationType === locationEnum.sensor) {
      dispatch(showAddDrawer ? setMapAddDrawerHide(farm_id) : setMapAddDrawerShow(farm_id));
      history.push(ADD_SENSORS_URL);
      return;
    }
    isLineWithWidth(locationType) && dispatch(upsertFormData(initialLineData[locationType]));
    const submitPath = `/create_location/${locationType}`;
    dispatch(setPersistedPaths([submitPath, '/map']));
    startDrawing(locationType);
  };

  const mapWrapperRef = useRef();

  const handleCloseSuccessHeader = () => {
    dispatch(canShowSuccessHeader(false));
    setShowSuccessHeader(false);
  };

  const handleDownload = () => {
    html2canvas(mapWrapperRef.current, { useCORS: true }).then((canvas) => {
      canvas.toBlob((blob) => {
        saveAs(blob, `${farm_name}-export-${new Date().toISOString()}.png`);
      });
    });
  };

  const handleShare = () => {
    html2canvas(mapWrapperRef.current, { useCORS: true }).then((canvas) => {
      const fileDataURL = canvas.toDataURL();
      dispatch(sendMapToEmail(fileDataURL));
    });
  };

  const handleConfirm = () => {
    setShowingConfirmButtons(false);
    if (!isLineWithWidth()) {
      const locationData = getOverlayInfo();
      if (Object.keys(overlayData).length === 0 || isRedrawing === true) {
        dispatch(upsertFormData(locationData));
        dispatch(setIsRedrawing(false));
      }
      history.push(`/create_location/${drawingState.type}`);
    }
  };

  const handleLineConfirm = (lineData) => {
    setShowingConfirmButtons(false);
    if (!overlayData.hasOwnProperty('type') || isRedrawing === true) {
      dispatch(upsertFormData({ ...lineData, ...getOverlayInfo() }));
      dispatch(setIsRedrawing(false));
    } else {
      dispatch(upsertFormData({ ...lineData }));
    }
    history.push(`/create_location/${drawingState.type}`);
  };

  const isLineWithWidth = (type = drawingState.type) => {
    return lineTypesWithWidth.includes(type);
  };

  const {
    showAdjustAreaSpotlightModal,
    showAdjustLineSpotlightModal,
    showZeroAreaWarning,
    showZeroLengthWarning,
  } = drawingState;

  return (
    <>
      {mapReady && !drawingState.type && !showSuccessHeader && <PureMapHeader farmName={farm_name} />}
      {mapReady && showSuccessHeader && (
        <PureSnackbarWithoutBorder
          className={styles.successSnackbar}
          onDismiss={handleCloseSuccessHeader}
          title={successMessage}
        />
      )}
      <div data-cy="map-selection" className={styles.pageWrapper}>
            <div className={styles.mapContainer}>
              <div data-cy="map-mapContainer" ref={mapWrapperRef} className={styles.mapContainer}>
                <div ref={mapContainerRef} style={{ width: '100%', height: '100%', flexGrow: 1 }} />
                {mapReady && (
                  <>
                    <CustomZoom
                      style={{ position: 'absolute', right: 12, bottom: 40 }}
                      onClickZoomIn={() => mapRef.current?.zoomIn()}
                      onClickZoomOut={() => mapRef.current?.zoomOut()}
                    />
                    <CustomCompass style={{ position: 'absolute', right: 12, bottom: 12 }} />
                  </>
                )}
              </div>
              {mapReady && drawingState.type && (
                <div
                  className={clsx(
                    styles.drawingBar,
                    isCompactSideMenu && styles.drawingBarWithCompactMenu,
                  )}
                >
                  <DrawingManager
                    drawingType={drawingState.type}
                    isDrawing={drawingState.isActive}
                    showLineModal={isLineWithWidth() && !drawingState.isActive}
                    onClickBack={() => {
                      setZeroAreaWarning(false);
                      setShowZeroLengthWarning(false);
                      resetDrawing(true);
                      dispatch(resetAndUnLockFormData());
                      closeDrawer();
                      setShowingConfirmButtons(false);
                    }}
                    onClickTryAgain={() => {
                      setZeroAreaWarning(false);
                      setShowZeroLengthWarning(false);
                      resetDrawing();
                      startDrawing(drawingState.type);
                      setShowingConfirmButtons(false);
                      dispatch(setIsRedrawing(true));
                    }}
                    onClickConfirm={handleConfirm}
                    showZeroAreaWarning={showZeroAreaWarning}
                    showZeroLengthWarning={showZeroLengthWarning}
                    confirmLine={handleLineConfirm}
                    updateLineWidth={setLineWidth}
                    system={system}
                    lineData={overlayData}
                    typeOfLine={drawingState.type}
                    onLineParameterChange={() => {
                      dispatch(setIsRedrawing(true));
                    }}
                  />
                </div>
              )}
            </div>
            {mapReady && <LocationSelectionModal history={history} />}

            {mapReady && !drawingState.type && (
              <PureMapFooter
                isAdmin={is_admin}
                showSpotlight={!showedSpotlight.map}
                resetSpotlight={() => dispatch(setSpotlightToShown('map'))}
                onClickAdd={handleClickAdd}
                showModal={showExportModal}
                onClickExport={handleClickExport}
                setShowMapFilter={setShowMapFilter}
                showMapFilter={showMapFilter}
                setShowAddDrawer={(showAddDrawer) => {
                  dispatch(
                    showAddDrawer ? setMapAddDrawerShow(farm_id) : setMapAddDrawerHide(farm_id),
                  );
                }}
                showAddDrawer={showAddDrawer}
                handleClickFilter={handleClickFilter}
                filterSettings={filterSettings}
                onFilterMenuClick={handleFilterMenuClick}
                onAddMenuClick={handleAddMenuClick}
                availableFilterSettings={availableFilterSettings}
                isMapFilterSettingActive={isMapFilterSettingActive}
                isCompactSideMenu={isCompactSideMenu}
                isOffline={isOffline}
              />
            )}
            {showExportModal && (
              <ExportMapModal
                onClickDownload={handleDownload}
                onClickShare={handleShare}
                dismissModal={() => setShowExportModal(false)}
              />
            )}
            {showDrawAreaSpotlightModal && (
              <DrawAreaModal
                dismissModal={() => {
                  setShowDrawAreaSpotlightModal(false);
                  dispatch(setSpotlightToShown('draw_area'));
                }}
              />
            )}
            {showDrawLineSpotlightModal && (
              <DrawLineModal
                dismissModal={() => {
                  setShowDrawLineSpotlightModal(false);
                  dispatch(setSpotlightToShown('draw_line'));
                }}
              />
            )}
            {showAdjustAreaSpotlightModal && (
              <AdjustAreaModal
                dismissModal={() => {
                  setShowAdjustAreaSpotlightModal(false);
                  dispatch(setSpotlightToShown('adjust_area'));
                }}
              />
            )}
            {showAdjustLineSpotlightModal && (
              <AdjustLineModal
                dismissModal={() => {
                  setShowAdjustLineSpotlightModal(false);
                  dispatch(setSpotlightToShown('adjust_line'));
                }}
              />
            )}
      </div>
      <LoadingBackdrop
        isOpen={!mapReady || (!isFetchingInternalLocations && isLoadingExternalLocations)}
        showDelay={400}
        isCompactSideMenu={isCompactSideMenu}
        dataName={t('MENU.MAP').toLocaleLowerCase()}
      />
    </>
  );
}
