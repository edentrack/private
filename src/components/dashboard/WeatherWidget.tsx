import { useEffect, useState } from 'react';
import { Wind, Droplets, AlertTriangle, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface HeatStress {
  level: string;
  color: string;
  advice: string;
}

interface CurrentWeather {
  temp: number;
  feelsLike: number;
  humidity: number;
  windKph: number;
  rain: number;
  emoji: string;
  label: string;
  thi: number;
  heatStress: HeatStress;
}

interface ForecastDay {
  day: string;
  date: string;
  emoji: string;
  label: string;
  tempMax: number;
  tempMin: number;
  rain: number;
  heatStressLevel: string;
  heatStressColor: string;
}

interface WeatherData {
  location: string;
  current: CurrentWeather;
  forecast: ForecastDay[];
}

const STRESS_BG: Record<string, string> = {
  none: 'bg-white border-gray-100',
  mild: 'bg-yellow-50 border-yellow-200',
  moderate: 'bg-orange-50 border-orange-200',
  severe: 'bg-red-50 border-red-200',
};

const STRESS_TEXT: Record<string, string> = {
  none: 'text-gray-700',
  mild: 'text-yellow-700',
  moderate: 'text-orange-700',
  severe: 'text-red-700',
};

interface Props {
  /** City + country string from the farm record, e.g. "Douala, Cameroon" */
  fallbackLocation?: string;
  onOpenSettings?: () => void;
}

async function fetchWeather(token: string, location: string): Promise<WeatherData> {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weather?location=${encodeURIComponent(location)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Weather unavailable');
  return data;
}

export function WeatherWidget({ fallbackLocation, onOpenSettings }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fallbackLocation) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        const data = await fetchWeather(token, fallbackLocation!);
        if (!cancelled) setWeather(data);
      } catch {
        // silently hide widget on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [fallbackLocation]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-3 animate-pulse flex gap-3 items-center">
        <div className="h-8 w-8 bg-gray-100 rounded-full shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-gray-100 rounded w-1/3" />
          <div className="h-5 bg-gray-100 rounded w-1/4" />
        </div>
      </div>
    );
  }

  // No location set — show a nudge instead of hiding the widget entirely
  if (!fallbackLocation) {
    return (
      <button
        type="button"
        onClick={onOpenSettings}
        className="w-full bg-white border border-dashed border-gray-200 rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-left hover:bg-gray-50 transition-colors group"
      >
        <MapPin className="w-4 h-4 text-gray-400 group-hover:text-[#3D5F42] shrink-0" />
        <div>
          <p className="text-xs font-medium text-gray-600">Weather unavailable</p>
          <p className="text-xs text-gray-400">Add your city in Settings → Farm Location to see forecasts</p>
        </div>
      </button>
    );
  }

  if (!weather) return null;

  const { current, forecast } = weather;
  const hs = current.heatStress;
  const hasStress = hs.level !== 'none';

  return (
    <div className={`rounded-xl border overflow-hidden text-sm ${STRESS_BG[hs.level] ?? 'bg-white border-gray-100'}`}>
      <div className="px-3 py-2.5 flex items-center gap-3">
        <span className="text-2xl leading-none shrink-0">{current.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-lg font-bold text-gray-900">{current.temp}°C</span>
            <span className="text-gray-500 text-xs">{current.label}</span>
            {hasStress && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full capitalize ${STRESS_TEXT[hs.level] ?? 'text-orange-700'} bg-white/60`}>
                ⚠ {hs.level} heat stress
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{weather.location}</span>
            <span className="shrink-0 flex items-center gap-1">
              <Droplets className="w-3 h-3" />{current.humidity}%
            </span>
            <span className="shrink-0 flex items-center gap-1">
              <Wind className="w-3 h-3" />{current.windKph} km/h
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {forecast.map((day) => (
            <div key={day.date} className="text-center">
              <p className="text-xs text-gray-400">{day.day}</p>
              <span className="text-base">{day.emoji}</span>
              <p className="text-xs font-medium text-gray-700">{day.tempMax}°</p>
            </div>
          ))}
        </div>
      </div>

      {hasStress && hs.advice && (
        <div className={`px-3 py-1.5 border-t flex items-start gap-1.5 ${STRESS_BG[hs.level] ?? ''}`}>
          <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${STRESS_TEXT[hs.level] ?? 'text-orange-700'}`} />
          <p className={`text-xs ${STRESS_TEXT[hs.level] ?? 'text-orange-700'}`}>{hs.advice}</p>
        </div>
      )}
    </div>
  );
}
