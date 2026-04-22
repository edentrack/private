import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://edentrack.app";

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === ALLOWED_ORIGIN || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// Heat stress index for poultry (Temperature-Humidity Index)
// THI = 0.8*T + (RH/100)*(T - 14.4) + 46.4
function calcTHI(tempC: number, humidity: number): number {
  return 0.8 * tempC + (humidity / 100) * (tempC - 14.4) + 46.4;
}

function getHeatStressLevel(thi: number): { level: string; color: string; advice: string } {
  if (thi < 74)  return { level: "none",     color: "green",  advice: "" };
  if (thi < 78)  return { level: "mild",     color: "yellow", advice: "Monitor water intake. Ensure feeders are accessible." };
  if (thi < 84)  return { level: "moderate", color: "orange", advice: "Increase water points, add electrolytes, improve ventilation, reduce stocking density." };
  return           { level: "severe",   color: "red",    advice: "URGENT: Open all vents, mist fans if available, cool drinking water, reduce feed during hottest hours (10am–4pm). Severe losses possible." };
}

function getWMODescription(code: number): { label: string; emoji: string } {
  if (code === 0)           return { label: "Clear sky", emoji: "☀️" };
  if (code <= 2)            return { label: "Partly cloudy", emoji: "⛅" };
  if (code === 3)           return { label: "Overcast", emoji: "☁️" };
  if (code <= 49)           return { label: "Foggy", emoji: "🌫️" };
  if (code <= 67)           return { label: "Rainy", emoji: "🌧️" };
  if (code <= 77)           return { label: "Snowy", emoji: "❄️" };
  if (code <= 82)           return { label: "Rain showers", emoji: "🌦️" };
  if (code <= 99)           return { label: "Thunderstorm", emoji: "⛈️" };
  return { label: "Unknown", emoji: "🌡️" };
}

Deno.serve(async (req: Request) => {
  const ch = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: ch });

  const url = new URL(req.url);
  const location = url.searchParams.get("location") || "";
  const latParam = url.searchParams.get("lat");
  const lonParam = url.searchParams.get("lon");

  if (!location && (!latParam || !lonParam)) {
    return new Response(JSON.stringify({ error: "location or lat+lon param required" }), { status: 400, headers: { ...ch, "Content-Type": "application/json" } });
  }

  try {
    let latitude: number, longitude: number, name: string, country: string;

    if (latParam && lonParam) {
      // Use coordinates directly — reverse geocode for display name
      latitude = parseFloat(latParam);
      longitude = parseFloat(lonParam);
      const rgRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=&latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`
      );
      // Fallback: Open-Meteo geocoding doesn't support reverse lookup — use nominatim for display name only
      const nominatimRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        { headers: { "User-Agent": "edentrack-app/1.0" } }
      );
      const nominatimData = await nominatimRes.json();
      name = nominatimData.address?.city || nominatimData.address?.town || nominatimData.address?.village || nominatimData.address?.county || "Your location";
      country = nominatimData.address?.country || "";
      void rgRes;
    } else {
      // Step 1 — geocode city/country name
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
      );
      const geoData = await geoRes.json();

      if (!geoData.results?.length) {
        return new Response(JSON.stringify({ error: `Location "${location}" not found` }), { status: 404, headers: { ...ch, "Content-Type": "application/json" } });
      }

      ({ latitude, longitude, name, country } = geoData.results[0]);
    }

    // Step 2 — fetch current weather + 3-day forecast
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=4`
    );
    const weather = await weatherRes.json();

    const current = weather.current;
    const daily = weather.daily;

    const thi = calcTHI(current.temperature_2m, current.relative_humidity_2m);
    const heatStress = getHeatStressLevel(thi);
    const condition = getWMODescription(current.weather_code);

    // Build 3-day forecast (skip today index 0)
    const forecast = [1, 2, 3].map(i => {
      const date = new Date(daily.time[i]);
      const dayName = date.toLocaleDateString("en", { weekday: "short" });
      const fc = getWMODescription(daily.weather_code[i]);
      const thiMax = calcTHI(daily.temperature_2m_max[i], current.relative_humidity_2m);
      const stressMax = getHeatStressLevel(thiMax);
      return {
        day: dayName,
        date: daily.time[i],
        emoji: fc.emoji,
        label: fc.label,
        tempMax: Math.round(daily.temperature_2m_max[i]),
        tempMin: Math.round(daily.temperature_2m_min[i]),
        rain: daily.precipitation_sum[i],
        heatStressLevel: stressMax.level,
        heatStressColor: stressMax.color,
      };
    });

    return new Response(
      JSON.stringify({
        location: `${name}, ${country}`,
        current: {
          temp: Math.round(current.temperature_2m),
          feelsLike: Math.round(current.apparent_temperature),
          humidity: current.relative_humidity_2m,
          windKph: Math.round(current.wind_speed_10m),
          rain: current.precipitation,
          emoji: condition.emoji,
          label: condition.label,
          thi: Math.round(thi),
          heatStress,
        },
        forecast,
      }),
      { headers: { ...ch, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" } }
    );
  } catch (err) {
    console.error("weather error:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch weather" }), { status: 500, headers: { ...ch, "Content-Type": "application/json" } });
  }
});
