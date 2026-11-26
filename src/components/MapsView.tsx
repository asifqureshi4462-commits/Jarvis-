import React, { useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
} from 'lucide-react';
import type { GroundingChunk } from '../types/jarvis';

interface MapsViewProps {
  userLocation: { latitude: number; longitude: number } | null;
  onUpdateLocation: (loc: { latitude: number; longitude: number }) => void;
}

const DEFAULT_CENTER = { lat: 37.422, lng: -122.084 };

export const MapsView: React.FC<MapsViewProps> = ({
  userLocation,
  onUpdateLocation,
}) => {
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
    | string
    | undefined;
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [resultText, setResultText] = useState<string>('');
  const [groundingChunks, setGroundingChunks] = useState<GroundingChunk[]>([]);
  const [error, setError] = useState<string | null>(null);

  const center = userLocation
    ? { lat: userLocation.latitude, lng: userLocation.longitude }
    : DEFAULT_CENTER;

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onUpdateLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        setError(`Location access denied or unavailable: ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePlaceSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query.trim(),
          useMapsGrounding: true,
          location: userLocation,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Maps Grounding query failed.');
      }
      setResultText(data.reply || '');
      setGroundingChunks(
        Array.isArray(data.groundingChunks) ? data.groundingChunks : []
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to search nearby places.'
      );
    } finally {
      setSearching(false);
    }
  };

  const mapLinks = groundingChunks.filter((c) => c.maps?.uri || c.maps?.title);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Compass className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            <span>Navigation & Spatial Intelligence</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Interactive Google Maps view paired with Gemini Maps Grounding for nearby places, hours, and routes.
          </p>
        </div>

        <button
          type="button"
          onClick={requestCurrentLocation}
          disabled={locating}
          className="min-h-[44px] px-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-xs font-medium text-cyan-800 dark:text-cyan-200 hover:bg-cyan-500/20 inline-flex items-center gap-2"
        >
          {locating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4" />
          )}
          <span>
            {userLocation ? 'Refresh GPS Lock' : 'Share My Location'}
          </span>
        </button>
      </div>

      {/* Maps Grounding Search */}
      <form
        onSubmit={handlePlaceSearch}
        className="rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-4 flex flex-col sm:flex-row gap-2.5 shadow-sm"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask J.A.R.V.I.S for nearby cafes, hospitals, directions, or places..."
            className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="min-h-[44px] px-5 rounded-xl bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950 font-semibold text-sm hover:bg-cyan-500 dark:hover:bg-cyan-300 transition-colors disabled:opacity-40"
        >
          {searching ? 'Scanning...' : 'Locate Places'}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/25 px-4 py-2.5 text-xs sm:text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Interactive Map Container with explicit non-zero height (CF2) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E] overflow-hidden shadow-sm">
          {mapsKey ? (
            <div className="w-full h-[340px] sm:h-[420px]">
              <APIProvider
                apiKey={mapsKey}
                libraries={['marker', 'places']}
                language="en"
                region="US"
              >
                <GoogleMap
                  mapId="DEMO_MAP_ID"
                  defaultCenter={center}
                  center={center}
                  defaultZoom={13}
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  <AdvancedMarker
                    ref={markerRef}
                    position={center}
                    onClick={() => setInfoOpen((prev) => !prev)}
                  >
                    <Pin
                      background="#00E5FF"
                      borderColor="#04070D"
                      glyphColor="#04070D"
                    />
                  </AdvancedMarker>
                  {infoOpen && (
                    <InfoWindow
                      anchor={marker}
                      onCloseClick={() => setInfoOpen(false)}
                    >
                      <div className="text-slate-900 text-xs font-medium p-1">
                        {userLocation
                          ? `Current Coordinates (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})`
                          : 'Reference Location — Click Share My Location for GPS'}
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              </APIProvider>
            </div>
          ) : (
            <div className="h-[340px] sm:h-[420px] flex flex-col items-center justify-center p-6 text-center space-y-2">
              <MapPin className="w-8 h-8 text-amber-500 dark:text-amber-400" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Google Maps JavaScript Key Pending
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm">
                You can still query live places, ratings, and Google Maps links using the Gemini Maps Grounding bar above.
              </p>
            </div>
          )}
        </div>

        {/* Grounded Places Results */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#08101E]/90 p-4 sm:p-5 flex flex-col space-y-3 shadow-sm">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Verified Place Intelligence
          </h2>

          {!resultText && mapLinks.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              Ask about restaurants, transit hubs, pharmacies, or directions around you to view verified Google Maps results.
            </p>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {resultText && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#050A14] p-3.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {resultText}
                </div>
              )}

              {mapLinks.map((chunk, idx) => {
                const place = chunk.maps;
                if (!place) return null;
                const snippets = place.placeAnswerSources?.reviewSnippets || [];
                return (
                  <div
                    key={`${place.uri || idx}`}
                    className="rounded-xl border border-cyan-500/25 bg-slate-50 dark:bg-[#050A14] p-3.5 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-200">
                        {place.title || 'Google Maps Place'}
                      </p>
                      {place.uri && (
                        <a
                          href={place.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-cyan-700 dark:text-cyan-400 hover:underline shrink-0"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    {snippets.slice(0, 2).map((s, sIdx) => (
                      <p key={sIdx} className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                        "{s.content}"
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
