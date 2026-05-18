"use client";

import { useState, useEffect, useRef } from "react";
import { Search, MapPin } from "lucide-react";

interface Prediction {
  name: string;
  place_id: string;
}

export default function SearchBar({ onSearch }: { onSearch: (name: string, placeId: string) => void }) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lon: number} | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
        let url = `/api/places-autocomplete?q=${encodeURIComponent(query)}`;
        if (userLocation) {
          url += `&lat=${userLocation.lat}&lon=${userLocation.lon}`;
        }
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
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 w-full">
        <input
          type="text"
          placeholder="Enter restaurant name and location..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (predictions.length > 0) setIsDropdownOpen(true); }}
          className="flex-1 p-4 border-brutal border-black text-lg focus:outline-none shadow-brutal translate-brutal transition-transform focus:translate-x-1 focus:translate-y-1 focus:shadow-brutal-sm"
          style={{ borderWidth: "3px" }}
          required
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-primary text-black p-4 font-bold text-lg border-brutal border-black flex items-center justify-center gap-2 hover:bg-yellow-400 active:translate-x-1 active:translate-y-1 shadow-brutal active:shadow-brutal-sm transition-all"
          style={{ borderWidth: "3px" }}
        >
          <Search size={24} />
          {isLoading ? "Searching..." : "Analyze Now"}
        </button>
      </form>

      {isDropdownOpen && predictions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] z-50 max-h-80 overflow-y-auto">
          {predictions.map((p) => (
            <div
              key={p.place_id}
              className="p-4 border-b-2 border-black last:border-b-0 hover:bg-yellow-100 cursor-pointer flex items-start gap-3 transition-colors"
              onClick={() => handleSelect(p.name, p.place_id)}
            >
              <MapPin className="mt-1 flex-shrink-0" size={20} />
              <div className="flex-1 text-left">
                <span className="font-bold block">{p.name.split(',')[0]}</span>
                <span className="text-sm text-gray-700">{p.name.split(',').slice(1).join(',')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
