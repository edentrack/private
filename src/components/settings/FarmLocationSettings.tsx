import { useState, useEffect } from 'react';
import { MapPin, Navigation, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

export function FarmLocationSettings() {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [regionState, setRegionState] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const [locationSharingConsent, setLocationSharingConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [detectingLocation, setDetectingLocation] = useState(false);

  useEffect(() => {
    if (currentFarm?.id) {
      loadLocationData();
    }
  }, [currentFarm?.id]);

  const loadLocationData = async () => {
    if (!currentFarm?.id) return;

    const { data } = await supabase
      .from('farms')
      .select('address_line1, address_line2, city, region_state, country, postal_code, latitude, longitude, location_notes, location_sharing_consent')
      .eq('id', currentFarm.id)
      .single();

    if (data) {
      setAddressLine1(data.address_line1 || '');
      setAddressLine2(data.address_line2 || '');
      setCity(data.city || '');
      setRegionState(data.region_state || '');
      setCountry(data.country || '');
      setPostalCode(data.postal_code || '');
      setLatitude(data.latitude?.toString() || '');
      setLongitude(data.longitude?.toString() || '');
      setLocationNotes(data.location_notes || '');
      setLocationSharingConsent(data.location_sharing_consent || false);
    }
  };

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setMessage(t('settings.geolocation_not_supported') || 'Geolocation not supported by your browser');
      return;
    }

    setDetectingLocation(true);
    setMessage('');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      setLatitude(lat.toFixed(6));
      setLongitude(lon.toFixed(6));

      let addressFound = false;
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'Ebenezer Farm Manager'
            }
          }
        );

        const data = await response.json();

        if (data.address) {
          const addr = data.address;

          const streetParts = [
            addr.house_number,
            addr.road || addr.street || addr.footway || addr.path || addr.pedestrian
          ].filter(Boolean).join(' ');

          if (streetParts) {
            setAddressLine1(streetParts);
          } else if (data.display_name) {
            const displayParts = data.display_name.split(',');
            if (displayParts.length > 0) {
              setAddressLine1(displayParts[0].trim());
            }
          }

          const line2 = addr.suburb || addr.neighbourhood || addr.quarter || addr.hamlet || '';
          setAddressLine2(line2);

          const cityValue = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
          setCity(cityValue);

          const regionValue = addr.state || addr.region || addr.province || addr.state_district || '';
          setRegionState(regionValue);

          const countryValue = addr.country || '';
          setCountry(countryValue);

          const postalValue = addr.postcode || '';
          setPostalCode(postalValue);

          addressFound = true;
        }
      } catch (geocodeError) {
        if (import.meta.env.DEV) console.warn('Reverse geocoding failed:', geocodeError);
      }

      if (addressFound) {
        setMessage(t('settings.location_detected') || 'Location and address detected successfully!');
      } else {
        setMessage(t('settings.coordinates_detected') || 'Coordinates detected. Address lookup failed - please enter manually.');
      }
    } catch (error: any) {
      if (error.code === 1) {
        setMessage(t('settings.location_denied') || 'Location access denied. Please enable location in your browser.');
      } else {
        setMessage(t('settings.location_error') || 'Could not get your location. Please enter manually.');
      }
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!currentFarm?.id) return;

    setSaving(true);
    setMessage('');

    try {
      const { error } = await supabase
        .from('farms')
        .update({
          address_line1: addressLine1 || null,
          address_line2: addressLine2 || null,
          city: city || null,
          region_state: regionState || null,
          postal_code: postalCode || null,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          location_notes: locationNotes || null,
          location_sharing_consent: locationSharingConsent,
        })
        .eq('id', currentFarm.id);

      if (error) throw error;

      setMessage(t('settings.location_saved') || 'Location saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving location:', error);
      setMessage(t('settings.location_save_failed') || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  const fullAddress = [
    addressLine1,
    addressLine2,
    city,
    regionState,
    country,
    postalCode
  ].filter(Boolean).join(', ');

  return (
    <div className="section-card animate-fade-in-up">
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-circle-blue">
          <MapPin className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">{t('settings.farm_location') || 'Farm Location'}</h3>
          <p className="text-sm text-gray-500">{t('settings.farm_location_desc') || 'Help us locate your farm precisely'}</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
          message.includes('success') || message.includes('detected')
            ? 'bg-green-50 text-green-600'
            : 'bg-red-50 text-red-600'
        }`}>
          {message}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('settings.street_address') || 'Street Address'}
          </label>
          <input
            type="text"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder={t('settings.street_address_placeholder') || 'e.g., 123 Farm Road'}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 bg-white text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('settings.address_line_2') || 'Address Line 2 (Optional)'}
          </label>
          <input
            type="text"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            placeholder={t('settings.address_line_2_placeholder') || 'e.g., Near Central Market'}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 bg-white text-gray-900"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.city_town') || 'City/Town'}
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t('settings.city_town_placeholder') || 'e.g., Douala'}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 bg-white text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.region_state') || 'Region/State'}
            </label>
            <input
              type="text"
              value={regionState}
              onChange={(e) => setRegionState(e.target.value)}
              placeholder={t('settings.region_state_placeholder') || 'e.g., Littoral'}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 bg-white text-gray-900"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.country') || 'Country'}
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={t('settings.country_placeholder') || 'e.g., Cameroon'}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 bg-white text-gray-900"
              disabled
            />
            <p className="text-xs text-gray-500 mt-1">{t('settings.country_set_above') || 'Set in Farm Information above'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.postal_code') || 'Postal Code (Optional)'}
            </label>
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder={t('settings.postal_code_placeholder') || 'e.g., 12345'}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 bg-white text-gray-900"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Navigation className="w-5 h-5 text-gray-600" />
            <h4 className="font-medium text-gray-900">{t('settings.gps_coordinates') || 'GPS Coordinates (Optional)'}</h4>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('settings.gps_coordinates_desc') || 'For precise location mapping'}</p>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.latitude') || 'Latitude'}
              </label>
              <input
                type="text"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder={t('settings.latitude_placeholder') || 'e.g., 4.0511'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 bg-white text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.longitude') || 'Longitude'}
              </label>
              <input
                type="text"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder={t('settings.longitude_placeholder') || 'e.g., 9.7679'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 bg-white text-gray-900"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={getCurrentLocation}
            disabled={detectingLocation}
            className="w-full px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-medium hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <MapPin className="w-5 h-5" />
            {detectingLocation ? (t('settings.detecting_location') || 'Detecting Location...') : (t('settings.use_current_location') || 'Use My Current Location')}
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('settings.additional_notes') || 'Additional Notes (Optional)'}
          </label>
          <textarea
            value={locationNotes}
            onChange={(e) => setLocationNotes(e.target.value)}
            placeholder={t('settings.additional_notes_placeholder') || 'e.g., Behind the school, Turn left at gas station'}
            rows={2}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neon-500/20 focus:border-neon-500 resize-none bg-white text-gray-900"
          />
        </div>

        {fullAddress && (
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-sm font-medium text-gray-700 mb-2">{t('settings.full_address_preview') || 'Full Address Preview'}</p>
            <p className="text-gray-900">{fullAddress}</p>
            {latitude && longitude && (
              <p className="text-sm text-gray-500 mt-2">GPS: {latitude}, {longitude}</p>
            )}
          </div>
        )}

        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl">
          <input
            type="checkbox"
            id="locationConsent"
            checked={locationSharingConsent}
            onChange={(e) => setLocationSharingConsent(e.target.checked)}
            className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <label htmlFor="locationConsent" className="text-sm text-gray-700">
            {t('settings.share_location') || 'Share my location with suppliers for delivery estimates'}
          </label>
        </div>

        <div className="flex items-start gap-2 text-sm text-gray-500">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            {t('settings.location_why_needed') || 'Why we need this: Supplier delivery estimates, connect with nearby farmers, local weather data (future). Your exact location is private and only shared with your consent.'}
          </p>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => {
              setAddressLine1('');
              setAddressLine2('');
              setCity('');
              setRegionState('');
              setPostalCode('');
              setLatitude('');
              setLongitude('');
              setLocationNotes('');
            }}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            {t('common.clear') || 'Clear'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-3 bg-neon-500 text-gray-900 rounded-xl font-medium hover:bg-neon-400 transition-colors disabled:opacity-50"
          >
            {saving ? (t('settings.saving') || 'Saving...') : (t('settings.save_location') || 'Save Location')}
          </button>
        </div>
      </div>
    </div>
  );
}
