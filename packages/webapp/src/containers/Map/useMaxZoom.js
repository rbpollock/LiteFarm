import { useDispatch, useSelector } from 'react-redux';
import { mapCacheSelector, setMapCache, setRetrievedPoints } from './mapCacheSlice';
import { userFarmSelector } from '../userFarmSlice';
import { usePropRef } from '../../components/LocationPicker/SingleLocationPicker/usePropRef';
import { DEFAULT_MAX_ZOOM } from './constants';
import useLocations from '../../hooks/location/useLocations';
import useExternalLocations from '../../hooks/location/useExternalLocations';

// irl.coop: Google's MaxZoomService is gone. The basemap (PMTiles) has a fixed
// max zoom, so we just use the default — no per-farm dynamic max-zoom lookup.
export function useMaxZoom() {
  const { maxZoom, retrievedPoints } = useSelector(mapCacheSelector);
  const { farm_id, grid_points } = useSelector(userFarmSelector);
  const dispatch = useDispatch();
  const setMaxZoom = (maxZoom) => {
    dispatch(setMapCache({ maxZoom, farm_id }));
  };
  const { locations: internalPoints } = useLocations({
    filterBy: 'point',
  });
  const { locations: externalPoints } = useExternalLocations({ filterBy: 'point' });
  const points = [...(internalPoints ?? []), ...(externalPoints ?? [])];

  const getMaxZoom = async (_maps = null, _map = null) => {
    // Preserve the cached value if present; otherwise fall back to the default.
    if (!maxZoom) {
      setMaxZoom(DEFAULT_MAX_ZOOM);
      dispatch(setRetrievedPoints({ farm_id, retrievedPoints: [...retrievedPoints] }));
    }
  };
  const maxZoomRef = usePropRef(maxZoom);
  return { maxZoom, maxZoomRef, getMaxZoom };
}
