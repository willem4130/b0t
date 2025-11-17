'use client';

import { useEffect, useState } from 'react';

interface WeatherData {
  temperature: number;
  weatherCode: number;
  isLoading: boolean;
  error: string | null;
  unit?: string;
}

interface CachedWeather extends WeatherData {
  timestamp: number;
}

// Cache weather data in memory (survives route changes)
let weatherCache: CachedWeather | null = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// WMO Weather interpretation codes
const getWeatherEmoji = (code: number): string => {
  if (code === 0) return '☀️'; // Clear sky
  if (code <= 3) return '⛅'; // Partly cloudy
  if (code <= 48) return '🌫️'; // Fog
  if (code <= 57) return '🌧️'; // Drizzle
  if (code <= 67) return '🌧️'; // Rain
  if (code <= 77) return '❄️'; // Snow
  if (code <= 82) return '🌧️'; // Rain showers
  if (code <= 86) return '❄️'; // Snow showers
  if (code >= 95) return '⛈️'; // Thunderstorm
  return '🌤️';
};

// Determine if location uses Fahrenheit (US, Liberia, Myanmar, some Caribbean)
const usesFahrenheit = (timezone: string): boolean => {
  return (
    timezone.startsWith('America/') &&
    !timezone.includes('Argentina') &&
    !timezone.includes('Brazil') &&
    !timezone.includes('Chile')
  ) || timezone.startsWith('Pacific/');
};

export function useWeather() {
  const [weather, setWeather] = useState<WeatherData>(() => {
    // Initialize with cached data if available and fresh
    if (weatherCache && Date.now() - weatherCache.timestamp < CACHE_DURATION) {
      return {
        temperature: weatherCache.temperature,
        weatherCode: weatherCache.weatherCode,
        isLoading: weatherCache.isLoading,
        error: weatherCache.error,
        unit: weatherCache.unit,
      };
    }
    return {
      temperature: 0,
      weatherCode: 0,
      isLoading: true,
      error: null,
    };
  });

  useEffect(() => {
    let isMounted = true;

    // If we have fresh cached data, don't refetch
    if (weatherCache && Date.now() - weatherCache.timestamp < CACHE_DURATION) {
      return;
    }

    const fetchWeather = async (latitude: number, longitude: number, useFahrenheit: boolean) => {
      try {
        const tempUnit = useFahrenheit ? 'fahrenheit' : 'celsius';
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=${tempUnit}`
        );

        if (!response.ok) throw new Error('Weather fetch failed');

        const data = await response.json();

        if (isMounted) {
          const unit = useFahrenheit ? '°F' : '°C';
          const weatherData = {
            temperature: Math.round(data.current_weather.temperature),
            weatherCode: data.current_weather.weathercode,
            isLoading: false,
            error: null,
            unit,
          };

          // Update state and cache
          setWeather(weatherData);
          weatherCache = {
            ...weatherData,
            timestamp: Date.now(),
          };
        }
      } catch {
        if (isMounted) {
          setWeather(prev => ({
            ...prev,
            isLoading: false,
            error: 'Unable to fetch weather',
          }));
        }
      }
    };

    // Get user's timezone and determine temperature unit
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const useFahrenheit = usesFahrenheit(tz);

    // Get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchWeather(position.coords.latitude, position.coords.longitude, useFahrenheit);
        },
        () => {
          if (isMounted) {
            setWeather(prev => ({
              ...prev,
              isLoading: false,
              error: 'Location access denied',
            }));
          }
        }
      );
    } else {
      setWeather(prev => ({
        ...prev,
        isLoading: false,
        error: 'Geolocation not supported',
      }));
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const emoji = getWeatherEmoji(weather.weatherCode);

  return {
    ...weather,
    emoji,
    display: weather.isLoading ? null : `${emoji} ${weather.temperature}${weather.unit || '°C'}`,
  };
}
