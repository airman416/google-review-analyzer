"use client";

import { useState, useEffect, useRef } from "react";
import { Search, MapPin } from "lucide-react";
import { buildApiUrl } from "@/lib/apiBaseUrl";

interface Prediction {
  name: string;
  place_id: string;
}

export default function SearchBar({ onSearch, initialQuery }: { onSearch: (name: string, placeId: string) => void; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lon: number} | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync if parent changes initialQuery after mount (e.g. pill click)
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQuery(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [initialQuery]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  }, []);

  useEffect(() => {
    const fetchPredictions = async () => {
      if (query.trim().length < 3) {
        setPredictions([]);
        return;
      }
      setIsLoading(true);
      try {
        let path = `/api/places-autocomplete?q=${encodeURIComponent(query)}`;
        if (userLocation) {
          path += `&lat=${userLocation.lat}&lon=${userLocation.lon}`;
        }
        const url = buildApiUrl(path);
        const res = await fetch(url);
        const data = (await res.json()) as { predictions?: Prediction[] };
        setPredictions(data.predictions || []);
        setIsDropdownOpen(true);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchPredictions();
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [query, userLocation]);

  // Handle clicking outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (name: string, placeId: string) => {
    setQuery(name);
    setIsDropdownOpen(false);
    onSearch(name, placeId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      // Use the typed query if no prediction is selected
      const mockPlaceId = `search-${Date.now()}`;
      onSearch(query, mockPlaceId);
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto" ref={dropdownRef}>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-[#eaeaeb] rounded-[24px] p-2 pl-6 focus-within:ring-4 focus-within:ring-[#094413]/10 transition-all duration-300">
        <input
          type="text"
          placeholder="Find your restaurant"
          value={query}
          ref={inputRef}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (predictions.length > 0) setIsDropdownOpen(true); }}
          className="flex-1 bg-transparent py-3 text-lg text-black outline-none placeholder:text-gray-500 font-medium"
          required
        />
        <button
          type="submit"
          disabled={isLoading}
          title="Analyze Now"
          className="bg-primary hover:bg-primary-hover active:scale-95 text-white w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 shrink-0 cursor-pointer shadow-sm"
        >
          <span className="text-xl font-extrabold leading-none pb-0.5">↑</span>
        </button>
      </form>

      {isDropdownOpen && predictions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-2xl border border-black/5 shadow-2xl z-50 max-h-80 overflow-y-auto overflow-hidden">
          {predictions.map((p) => (
            <div
              key={p.place_id}
              className="p-4 border-b border-gray-100 last:border-b-0 hover:bg-[#094413] hover:text-white group cursor-pointer flex items-start gap-3 transition-colors duration-150"
              onClick={() => handleSelect(p.name, p.place_id)}
            >
              <MapPin className="mt-1 flex-shrink-0 text-[#094413] group-hover:text-white transition-colors" size={20} />
              <div className="flex-1 text-left">
                <span className="font-bold text-gray-900 group-hover:text-white block transition-colors">{p.name.split(',')[0]}</span>
                <span className="text-sm text-gray-500 group-hover:text-white/80 block transition-colors">{p.name.split(',').slice(1).join(',')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
