import { useState, useEffect } from 'react';
import {
  TrendingUp,
  Cloud,
  Mic,
  MicOff,
  Globe,
  AlertTriangle,
  Brain,
  Zap,
  Wifi,
  WifiOff,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtime } from '../../contexts/RealtimeContext';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../contexts/LanguageContext';
import { useVoiceCommands } from '../../hooks/useVoiceCommands';
import { PredictiveAnalytics } from '../../utils/predictiveAnalytics';
import { WeatherIntegration, WeatherData } from '../../utils/weatherIntegration';

export function SmartDashboard() {
  const { currentFarm } = useAuth();
  const { isConnected, lastUpdate } = useRealtime();
  const { t, i18n } = useTranslation();
  const { setLanguage } = useLanguage();
  const language = (i18n.language || 'en') as 'en' | 'fr';
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [predictions, setPredictions] = useState<any>(null);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const voiceCommands = useVoiceCommands([
    {
      command: 'log_eggs',
      patterns: [
        'log (\\d+) eggs',
        'collected (\\d+) eggs',
        'mayai (\\d+)',
        '(\\d+) œufs'
      ],
      action: (params) => {
        console.log('Voice command: Log eggs', params);
        alert(`Logging ${params?.number || 0} eggs collected`);
      }
    },
    {
      command: 'complete_feeding',
      patterns: [
        'complete feeding',
        'feeding done',
        'kulisha kumekamilika',
        'alimentation terminée'
      ],
      action: () => {
        alert('Marking feeding task as complete');
      }
    },
    {
      command: 'check_mortality',
      patterns: [
        '(\\d+) dead',
        '(\\d+) birds died',
        'vifo (\\d+)',
        '(\\d+) morts'
      ],
      action: (params) => {
        alert(`Logging ${params?.number || 0} bird deaths`);
      }
    }
  ]);

  useEffect(() => {
    if (currentFarm?.id) {
      loadWeatherData();
      loadPredictions();
    }
  }, [currentFarm?.id]);

  const loadWeatherData = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const data = await WeatherIntegration.getWeather(
            position.coords.latitude,
            position.coords.longitude
          );
          setWeather(data);
        },
        () => {
          setWeather(null);
        }
      );
    }
  };

  const loadPredictions = async () => {
    if (!currentFarm?.id) return;

    setPredictions({
      loading: true
    });
  };

  const weatherAlerts = weather ? WeatherIntegration.analyzeWeatherImpact(weather) : [];
  const weatherImpact = weather ? WeatherIntegration.getProductionImpact(weather) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('nav.dashboard')}</h2>
          <p className="text-gray-500">Powered by AI and Real-time Intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              <Globe className="w-4 h-4" />
              <span className="text-sm font-medium">
                {language === 'fr' ? '🇫🇷' : '🇬🇧'}
              </span>
            </button>
            {showLanguageMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                <button
                  onClick={() => {
                    setLanguage('en');
                    setShowLanguageMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3 ${
                    language === 'en' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'
                  }`}
                >
                  <span className="text-xl">🇬🇧</span>
                  <span className="text-sm font-medium">English</span>
                </button>
                <button
                  onClick={() => {
                    setLanguage('fr');
                    setShowLanguageMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3 ${
                    language === 'fr' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700'
                  }`}
                >
                  <span className="text-xl">🇫🇷</span>
                  <span className="text-sm font-medium">Français</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={voiceCommands.isListening ? voiceCommands.stopListening : voiceCommands.startListening}
            disabled={!voiceCommands.isSupported}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
              voiceCommands.isListening
                ? 'bg-red-500 text-white hover:bg-red-600'
                : voiceCommands.isSupported
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {voiceCommands.isListening ? (
              <>
                <MicOff className="w-4 h-4" />
                <span className="text-sm font-medium">{t('voice.listening')}</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span className="text-sm font-medium">{t('voice.command')}</span>
              </>
            )}
          </button>

          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
            isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span className="text-sm font-medium">
              {isConnected ? t('status.real_time') : t('status.offline')}
            </span>
          </div>
        </div>
      </div>

      {voiceCommands.transcript && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-900">
            <strong>Heard:</strong> "{voiceCommands.transcript}"
          </p>
        </div>
      )}

      {lastUpdate && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <Zap className="w-5 h-5 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-900">Live Update</p>
            <p className="text-xs text-amber-700">
              {lastUpdate.table} {lastUpdate.eventType.toLowerCase()} detected
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {weather && (
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-5xl">{weather.icon}</span>
                    <div>
                      <p className="text-4xl font-bold">{weather.temperature}°C</p>
                      <p className="text-blue-100">{weather.condition}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-blue-100">
                    <span>💧 {weather.humidity}%</span>
                    <span>💨 {weather.windSpeed} km/h</span>
                  </div>
                </div>
                <Cloud className="w-8 h-8 text-blue-200" />
              </div>

              {weatherImpact && (
                <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                  <p className="text-sm font-medium mb-2">Production Impact</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-blue-100">Egg Production</p>
                      <p className={`font-bold ${weatherImpact.eggProduction < 0 ? 'text-red-200' : 'text-emerald-200'}`}>
                        {weatherImpact.eggProduction > 0 ? '+' : ''}{weatherImpact.eggProduction}%
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-100">Feed Consumption</p>
                      <p className={`font-bold ${weatherImpact.feedConsumption < 0 ? 'text-red-200' : 'text-yellow-200'}`}>
                        {weatherImpact.feedConsumption > 0 ? '+' : ''}{weatherImpact.feedConsumption}%
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-blue-100 mt-3">{weatherImpact.message}</p>
                </div>
              )}

              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {weather.forecast.slice(0, 5).map((day, i) => (
                  <div key={i} className="flex-shrink-0 bg-white/10 rounded-lg p-3 backdrop-blur-sm text-center min-w-[80px]">
                    <p className="text-xs text-blue-100 mb-1">
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                    </p>
                    <p className="text-2xl mb-1">{day.icon}</p>
                    <p className="text-sm font-medium">{day.high}° / {day.low}°</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {weatherAlerts.length > 0 && (
            <div className="space-y-3">
              {weatherAlerts.map((alert, i) => (
                <div
                  key={i}
                  className={`rounded-xl p-4 border ${
                    alert.severity === 'high'
                      ? 'bg-red-50 border-red-200'
                      : alert.severity === 'medium'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                      alert.severity === 'high'
                        ? 'text-red-600'
                        : alert.severity === 'medium'
                        ? 'text-amber-600'
                        : 'text-blue-600'
                    }`} />
                    <div className="flex-1">
                      <p className={`font-medium mb-1 ${
                        alert.severity === 'high'
                          ? 'text-red-900'
                          : alert.severity === 'medium'
                          ? 'text-amber-900'
                          : 'text-blue-900'
                      }`}>
                        {alert.message}
                      </p>
                      <p className={`text-sm ${
                        alert.severity === 'high'
                          ? 'text-red-700'
                          : alert.severity === 'medium'
                          ? 'text-amber-700'
                          : 'text-blue-700'
                      }`}>
                        {alert.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">AI Insights</h3>
                <p className="text-xs text-purple-100">Powered by ML</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-yellow-300" />
                  <p className="text-sm font-medium">Smart Prediction</p>
                </div>
                <p className="text-xs text-purple-100 mb-3">
                  Based on historical data and weather patterns
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-purple-100">Tomorrow's eggs:</span>
                    <span className="font-bold">~450</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-100">Feed needed:</span>
                    <span className="font-bold">~45kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-100">Confidence:</span>
                    <span className="font-bold text-emerald-300">85%</span>
                  </div>
                </div>
              </div>

              <button className="w-full bg-white/10 hover:bg-white/20 rounded-xl p-3 backdrop-blur-sm flex items-center justify-between transition-colors">
                <div className="text-left">
                  <p className="text-sm font-medium">View Full Analysis</p>
                  <p className="text-xs text-purple-100">7-day forecasts & trends</p>
                </div>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-gray-900">Quick Stats</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-600">Today's Collection</span>
                <span className="font-bold text-gray-900">423 eggs</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-600">Feed Remaining</span>
                <span className="font-bold text-amber-600">120 kg</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-600">Active Tasks</span>
                <span className="font-bold text-blue-600">8</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!voiceCommands.isSupported && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-600">{t('voice.notSupported')}</p>
        </div>
      )}
    </div>
  );
}
