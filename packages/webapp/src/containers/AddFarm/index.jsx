import { useForm } from 'react-hook-form';
import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import CoopMap from '../../components/CoopMap';
import { VscLocation } from 'react-icons/vsc';
import { useDispatch, useSelector } from 'react-redux';
import {
  userFarmReducerSelector,
  userFarmsByUserSelector,
  userFarmSelector,
} from '../userFarmSlice';
import { forwardGeocode, reverseGeocode } from '../../util/geocode';
import LoadingAnimation from '../../assets/images/signUp/animated_loading_farm.svg?react';
import PureAddFarm from '../../components/AddFarm';
import { patchFarm, postFarm } from './saga';
import { useTranslation } from 'react-i18next';
import { pick } from '../../util/pick';

const AddFarm = () => {
  const history = useHistory();
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const farm = useSelector(userFarmSelector);
  const farms = useSelector(userFarmsByUserSelector);
  const isFirstFarm = !farms.length;
  const mainUserFarmSelector = useSelector(userFarmReducerSelector);
  const FARMNAME = 'farm_name';
  const ADDRESS = 'address';
  const GRID_POINTS = 'grid_points';
  const COUNTRY = 'country';
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    watch,
    trigger,
    formState: { errors, isValid },
  } = useForm({
    mode: 'onBlur',
    defaultValues: pick(farm, [FARMNAME, ADDRESS, GRID_POINTS, COUNTRY]),
  });

  const gridPoints = watch(GRID_POINTS);
  const disabled = !isValid;
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const farmNameRegister = register(FARMNAME, {
    required: { value: true, message: t('ADD_FARM.FARM_IS_REQUIRED') },
  });
  const addressRegister = register(ADDRESS, {
    required: { value: true, message: t('ADD_FARM.ADDRESS_IS_REQUIRED') },
  });
  const gridPointsRegister = register(GRID_POINTS, {
    required: { value: true, message: t('ADD_FARM.ENTER_A_VALID_ADDRESS') },
  });
  const countryRegister = register(COUNTRY, {
    required: { value: true, message: t('ADD_FARM.INVALID_FARM_LOCATION') },
  });
  const errorMessage = {
    geolocationDisabled: t('ADD_FARM.DISABLE_GEO_LOCATION'),
  };

  const addressErrors =
    errors[ADDRESS]?.message ||
    errors[GRID_POINTS]?.message ||
    errors[COUNTRY]?.message ||
    errorMessage[errors[ADDRESS]?.type];

  const showFarmNameCharacterLimitExceededError = () => {
    setError(FARMNAME, {
      type: 'manual',
      message: t('ADD_FARM.FARM_NAME_ERROR'),
    });
  };

  const onSubmit = (data) => {
    const farmInfo = {
      ...data,
      gridPoints,
      farm_id: farm ? farm.farm_id : undefined,
      showFarmNameCharacterLimitExceededError: showFarmNameCharacterLimitExceededError,
    };
    farm.farm_id ? dispatch(patchFarm(farmInfo)) : dispatch(postFarm(farmInfo));
  };

  const onGoBack = () => {
    history.push('/farm_selection');
  };

  // reverse-geocode an existing grid point that lacks a country (e.g. editing a
  // farm created before the country was captured)
  useEffect(() => {
    if (gridPoints && !getValues(COUNTRY)) {
      setCountryFromLatLng(gridPoints);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // irl.coop: reverse geocode (lat/lng -> country + address) via Nominatim (OSM).
  // With setAddress (map click), also populate the address/lat-long box.
  const setCountryFromLatLng = async (latlng, callback, { setAddress = false } = {}) => {
    const { lat, lng } = latlng;
    setIsGeocoding(true);
    setValue(GRID_POINTS, { lat, lng }, { shouldValidate: true });
    try {
      const result = await reverseGeocode(lat, lng);
      setValue(COUNTRY, result?.country, { shouldValidate: true });
      if (setAddress) {
        setValue(ADDRESS, result?.formatted || `${lat}, ${lng}`, { shouldValidate: true });
      }
    } finally {
      setIsGeocoding(false);
      callback?.();
    }
  };

  const parseLatLng = (latLngString) => {
    const coordRegex = /^(-?\d+(?:\.\d+)?)[,\s]\s*(-?\d+(\.\d+)?)$/;
    const matches = coordRegex.exec(latLngString);
    if (!matches) return null;

    const result = { lat: parseFloat(matches[1]), lng: parseFloat(matches[2]) };
    return Number.isNaN(result.lat) ||
      Number.isNaN(result.lng) ||
      result.lat < -90 ||
      result.lat > 90 ||
      result.lng < -180 ||
      result.lng > 180
      ? null
      : result;
  };

  const handleAddressChange = (e) => {
    const latlng = parseLatLng(e.target.value);
    if (latlng) {
      setCountryFromLatLng(latlng);
    } else {
      /**
       * GOOGLE MAP listener handlePlaceChanged is delayed, so gridPoints and country will be cleared before handlePlaceChanged is called.
       * Since forced validation is delayed by 100ms, clearing GRID_POINTS and COUNTRY would not trigger error before handlePlaceChanged is called.
       */
      setValue(GRID_POINTS, undefined);
      setValue(COUNTRY, undefined);
    }
  };

  const handleAddressBlur = async () => {
    const value = getValues(ADDRESS);
    if (value && !parseLatLng(value)) {
      setIsGeocoding(true);
      try {
        const result = await forwardGeocode(value);
        if (result) {
          setValue(GRID_POINTS, { lat: result.lat, lng: result.lng }, { shouldValidate: true });
          setValue(COUNTRY, result.country, { shouldValidate: true });
          setValue(ADDRESS, result.formatted, { shouldValidate: true });
        }
      } finally {
        setIsGeocoding(false);
      }
    }
    setTimeout(() => {
      trigger([GRID_POINTS, COUNTRY]);
    }, 100);
  };

  const handleGetGeoError = () => {
    setIsGettingLocation(false);
    setError(ADDRESS, {
      type: 'geolocationDisabled',
    });
  };

  const getGeoOptions = {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 10000,
  };

  const handleGetGeoSuccess = (position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    setValue(ADDRESS, `${lat}, ${lng}`, { shouldValidate: true });
    setCountryFromLatLng({ lat, lng }, () => {
      setIsGettingLocation(false);
    });
  };

  const getGeoLocation = () => {
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(handleGetGeoSuccess, handleGetGeoError, getGeoOptions);
  };
  return (
    <>
      <PureAddFarm
        onGoBack={isFirstFarm ? null : onGoBack}
        onSubmit={handleSubmit(onSubmit)}
        title={t('ADD_FARM.TELL_US_ABOUT_YOUR_FARM')}
        disabled={disabled}
        loading={mainUserFarmSelector.loading}
        inputs={[
          {
            label: t('ADD_FARM.FARM_NAME'),
            hookFormRegister: farmNameRegister,
            name: FARMNAME,
            errors: errors[FARMNAME]?.message,
          },
          {
            label: t('ADD_FARM.FARM_LOCATION'),
            placeholder: t('ADD_FARM.ENTER_LOCATION_PLACEHOLDER'),
            info: t('ADD_FARM.FARM_LOCATION_INPUT_INFO'),
            icon: isGettingLocation || isGeocoding ? (
              <LoadingAnimation />
            ) : (
              <VscLocation data-cy="addFarm-mapPin" size={27} onClick={getGeoLocation} />
            ),
            hookFormRegister: addressRegister,
            id: 'autocomplete',
            name: ADDRESS,
            errors: addressErrors,
            onBlur: handleAddressBlur,
            onChange: handleAddressChange,
          },
        ]}
        map={
          <CoopMap
            center={gridPoints}
            onPick={(latlng) => setCountryFromLatLng(latlng, undefined, { setAddress: true })}
          />
        }
      />
    </>
  );
};

export default AddFarm;
