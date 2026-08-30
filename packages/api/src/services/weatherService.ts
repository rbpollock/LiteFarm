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

// irl.coop: weather now flows through the coop-api weather gateway (a free,
// keyless provider — Open-Meteo — behind a cached endpoint) instead of
// OpenWeatherMap. No app-held weather API key.
import axios, { AxiosError } from 'axios';

interface WeatherParams {
  lat: number;
  lon: number;
}

interface LegacyWeatherParams extends WeatherParams {
  units: string;
}

export interface WeatherForecastSlot {
  dt: number;
  tempC: number;
  iconCode: string;
  pop: number;
  rainMm3h: number;
  snowMm3h: number;
  windMs: number;
  humidity: number;
}

export interface WeatherForecast {
  city: { name: string; timezoneOffsetSeconds: number };
  slots: WeatherForecastSlot[];
}

export interface LegacyWeatherCompat {
  city: string;
  temp: number;
  humidity: number;
  icon: string;
  date: number;
  wind: number;
  measurement: string;
  slots: WeatherForecastSlot[];
}

const COOP_API_URL = process.env.COOP_API_URL ?? '';
const COOP_TOKEN = process.env.KEYCLOAK_GROUPS_TOKEN ?? '';

async function fetchCoopForecast(lat: number, lon: number): Promise<WeatherForecast> {
  const url = `${COOP_API_URL}/api/v1/weather/forecast?lat=${lat}&lng=${lon}`;
  const response = await axios.get<WeatherForecast>(url, {
    headers: { Authorization: `Bearer ${COOP_TOKEN}` },
  });
  return response.data;
}

const wrapError = (error: unknown) => {
  const axiosError = error as AxiosError;
  return Object.assign(new Error('Failed to fetch weather data'), {
    status: axiosError.response?.status,
    details: axiosError.response?.data ?? axiosError.message,
  });
};

export const weatherService = {
  async fetchForecast({ lat, lon }: WeatherParams): Promise<WeatherForecast> {
    try {
      return await fetchCoopForecast(lat, lon);
    } catch (error) {
      throw wrapError(error);
    }
  },

  async fetchLegacyForecast({ lat, lon, units }: LegacyWeatherParams): Promise<LegacyWeatherCompat> {
    try {
      const data = await fetchCoopForecast(lat, lon);
      const [first] = data.slots;
      return {
        city: data.city.name,
        temp: Math.round(first?.tempC ?? 0),
        humidity: first?.humidity ?? 0,
        icon: first?.iconCode ?? '03d',
        date: first?.dt ?? 0,
        wind: first?.windMs ?? 0,
        measurement: units,
        slots: [],
      };
    } catch (error) {
      throw wrapError(error);
    }
  },
};

export default weatherService;
