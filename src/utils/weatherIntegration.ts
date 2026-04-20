export interface WeatherData {
  temperature: number;
  humidity: number;
  condition: string;
  icon: string;
  windSpeed: number;
  pressure: number;
  forecast: Array<{
    date: string;
    high: number;
    low: number;
    condition: string;
    icon: string;
  }>;
}

export interface WeatherAlert {
  severity: 'low' | 'medium' | 'high';
  message: string;
  recommendation: string;
}

export class WeatherIntegration {
  private static API_KEY = 'demo';

  static async getWeather(latitude: number, longitude: number): Promise<WeatherData | null> {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,pressure_msl&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`
      );

      if (!response.ok) throw new Error('Weather API request failed');

      const data = await response.json();

      return {
        temperature: Math.round(data.current.temperature_2m),
        humidity: data.current.relative_humidity_2m,
        condition: this.getWeatherCondition(data.current.weather_code),
        icon: this.getWeatherIcon(data.current.weather_code),
        windSpeed: data.current.wind_speed_10m,
        pressure: data.current.pressure_msl,
        forecast: data.daily.time.slice(1, 7).map((date: string, index: number) => ({
          date: date,
          high: Math.round(data.daily.temperature_2m_max[index + 1]),
          low: Math.round(data.daily.temperature_2m_min[index + 1]),
          condition: this.getWeatherCondition(data.daily.weather_code[index + 1]),
          icon: this.getWeatherIcon(data.daily.weather_code[index + 1])
        }))
      };
    } catch (error) {
      console.error('Error fetching weather:', error);
      return null;
    }
  }

  private static getWeatherCondition(code: number): string {
    const conditions: Record<number, string> = {
      0: 'Clear sky',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Foggy',
      48: 'Depositing rime fog',
      51: 'Light drizzle',
      53: 'Moderate drizzle',
      55: 'Dense drizzle',
      61: 'Slight rain',
      63: 'Moderate rain',
      65: 'Heavy rain',
      71: 'Slight snow',
      73: 'Moderate snow',
      75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight rain showers',
      81: 'Moderate rain showers',
      82: 'Violent rain showers',
      85: 'Slight snow showers',
      86: 'Heavy snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm with slight hail',
      99: 'Thunderstorm with heavy hail'
    };
    return conditions[code] || 'Unknown';
  }

  private static getWeatherIcon(code: number): string {
    if (code === 0 || code === 1) return '☀️';
    if (code === 2) return '⛅';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 55) return '🌦️';
    if (code >= 61 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '🌨️';
    if (code >= 80 && code <= 82) return '⛈️';
    if (code >= 85 && code <= 86) return '🌨️';
    if (code >= 95) return '⚡';
    return '🌤️';
  }

  static analyzeWeatherImpact(weather: WeatherData): WeatherAlert[] {
    const alerts: WeatherAlert[] = [];

    if (weather.temperature < 10) {
      alerts.push({
        severity: 'high',
        message: 'COLD ALERT: Temperature below 10°C',
        recommendation: 'Increase heating, add extra bedding, ensure water doesn\'t freeze, monitor for respiratory issues'
      });
    } else if (weather.temperature < 15) {
      alerts.push({
        severity: 'medium',
        message: 'Cold weather: Temperature below 15°C',
        recommendation: 'Provide adequate heating and reduce ventilation'
      });
    }

    if (weather.temperature > 35) {
      alerts.push({
        severity: 'high',
        message: 'HEAT STRESS ALERT: Temperature above 35°C',
        recommendation: 'Increase ventilation, ensure cool water availability, reduce feed concentration, consider misting systems'
      });
    } else if (weather.temperature > 30) {
      alerts.push({
        severity: 'medium',
        message: 'High temperature warning',
        recommendation: 'Monitor birds for heat stress, increase ventilation, provide cool water'
      });
    }

    if (weather.humidity > 80) {
      alerts.push({
        severity: 'medium',
        message: 'High humidity detected',
        recommendation: 'Increase ventilation to prevent respiratory issues and ammonia buildup'
      });
    } else if (weather.humidity < 30) {
      alerts.push({
        severity: 'low',
        message: 'Low humidity',
        recommendation: 'Monitor for dust issues and ensure water availability'
      });
    }

    if (weather.condition.toLowerCase().includes('storm') || weather.condition.toLowerCase().includes('thunder')) {
      alerts.push({
        severity: 'high',
        message: 'STORM WARNING',
        recommendation: 'Secure all equipment, check backup power systems, ensure birds are safely housed'
      });
    }

    if (weather.condition.toLowerCase().includes('heavy rain')) {
      alerts.push({
        severity: 'medium',
        message: 'Heavy rain expected',
        recommendation: 'Check drainage systems, inspect roof for leaks, prevent water from entering coops'
      });
    }

    if (weather.windSpeed > 40) {
      alerts.push({
        severity: 'high',
        message: 'Strong winds detected',
        recommendation: 'Secure loose items, check ventilation systems, inspect structural integrity'
      });
    }

    const tempSwings = weather.forecast.map((day, i) => {
      if (i === 0) return 0;
      return Math.abs(day.high - weather.forecast[i - 1].high);
    });

    const maxSwing = Math.max(...tempSwings);
    if (maxSwing > 10) {
      alerts.push({
        severity: 'medium',
        message: 'Large temperature fluctuation expected',
        recommendation: 'Prepare adjustable heating/cooling systems, monitor bird behavior closely'
      });
    }

    return alerts;
  }

  static getProductionImpact(weather: WeatherData): {
    eggProduction: number;
    feedConsumption: number;
    message: string;
  } {
    let eggImpact = 0;
    let feedImpact = 0;
    let messages: string[] = [];

    if (weather.temperature < 15) {
      feedImpact += 15;
      eggImpact -= 5;
      messages.push('Cold weather increases feed needs');
    } else if (weather.temperature > 30) {
      feedImpact -= 10;
      eggImpact -= 15;
      messages.push('Heat stress reduces both feed intake and egg production');
    }

    if (weather.temperature > 25 && weather.humidity > 70) {
      eggImpact -= 10;
      messages.push('High heat + humidity combination significantly impacts production');
    }

    if (weather.condition.toLowerCase().includes('storm')) {
      eggImpact -= 20;
      feedImpact -= 15;
      messages.push('Storm stress affects both production and appetite');
    }

    return {
      eggProduction: eggImpact,
      feedConsumption: feedImpact,
      message: messages.join('. ') || 'Weather conditions are optimal for production'
    };
  }
}
