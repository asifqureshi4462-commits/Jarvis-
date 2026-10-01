package com.jarvis.assistant.commands;

import com.jarvis.assistant.net.Http;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.Locale;

/** Weather from Open-Meteo (free, no API key). Call from a background thread. */
public final class WeatherService {
    private static final String GEO = "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=";
    private static final String FORECAST = "https://api.open-meteo.com/v1/forecast";

    private WeatherService() {}

    public static String fetch(String city) throws Exception {
        JSONObject geo = new JSONObject(Http.get(GEO + URLEncoder.encode(city, "UTF-8")));
        JSONArray results = geo.optJSONArray("results");
        if (results == null || results.length() == 0) {
            return "I couldn't find a place called \"" + city + "\".";
        }
        JSONObject p = results.getJSONObject(0);
        String url = FORECAST + "?latitude=" + p.getDouble("latitude") + "&longitude=" + p.getDouble("longitude")
                + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m"
                + "&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto";
        JSONObject w = new JSONObject(Http.get(url));
        JSONObject cur = w.getJSONObject("current");
        JSONObject daily = w.getJSONObject("daily");
        String place = p.optString("name", city);
        String country = p.optString("country", "");
        if (!country.isEmpty()) place += ", " + country;
        return String.format(Locale.US,
                "%s: %.0f\u00B0C (feels like %.0f\u00B0C), %s. Today's range %.0f\u00B0 to %.0f\u00B0C, humidity %d%%, wind %.0f km/h.",
                place,
                cur.getDouble("temperature_2m"),
                cur.getDouble("apparent_temperature"),
                describe(cur.getInt("weather_code")),
                daily.getJSONArray("temperature_2m_min").getDouble(0),
                daily.getJSONArray("temperature_2m_max").getDouble(0),
                cur.getInt("relative_humidity_2m"),
                cur.getDouble("wind_speed_10m"));
    }

    private static String describe(int code) {
        switch (code) {
            case 0: return "clear sky";
            case 1: return "mainly clear";
            case 2: return "partly cloudy";
            case 3: return "overcast";
            case 45: case 48: return "foggy";
            case 51: case 53: case 55: return "drizzle";
            case 56: case 57: return "freezing drizzle";
            case 61: case 63: case 65: return "rain";
            case 66: case 67: return "freezing rain";
            case 71: case 73: case 75: return "snowfall";
            case 77: return "snow grains";
            case 80: case 81: case 82: return "rain showers";
            case 85: case 86: return "snow showers";
            case 95: return "thunderstorm";
            case 96: case 99: return "thunderstorm with hail";
            default: return "mixed conditions";
        }
    }
}
