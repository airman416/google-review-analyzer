"use client";

import { useEffect, useRef, useState } from "react";

interface MapEmbedProps {
  placeId: string;
  restaurantName: string;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
    _mapsLoading?: boolean;
    _mapsLoaded?: boolean;
    _mapsCallbacks?: (() => void)[];
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (window._mapsLoaded) { resolve(); return; }
    if (!window._mapsCallbacks) window._mapsCallbacks = [];
    window._mapsCallbacks.push(resolve);
    if (window._mapsLoading) return;
    window._mapsLoading = true;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window._mapsLoaded = true;
      window._mapsLoading = false;
      window._mapsCallbacks?.forEach((cb) => cb());
      window._mapsCallbacks = [];
    };
    document.head.appendChild(script);
  });
}

export default function MapEmbed({ placeId, restaurantName }: MapEmbedProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { setError(true); return; }

    let cancelled = false;

    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapRef.current) return;

      const map = new window.google.maps.Map(mapRef.current, {
        zoom: 16,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        styles: [
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
          { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e5c5" }] },
          { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f0ede8" }] },
        ],
      });

      const service = new window.google.maps.places.PlacesService(map);

      const isValidPlaceId = placeId && !placeId.startsWith("search-");

      if (isValidPlaceId) {
        service.getDetails(
          { placeId, fields: ["geometry", "name", "formatted_address"] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (place: any, status: string) => {
            if (cancelled) return;
            if (status === "OK" && place?.geometry?.location) {
              map.setCenter(place.geometry.location);
              new window.google.maps.Marker({
                map,
                position: place.geometry.location,
                title: place.name,
                icon: {
                  path: "M15 3 L17.5 13.5 L27 15 L17.5 16.5 L15 27 L12.5 16.5 L3 15 L12.5 13.5 Z",
                  fillColor: "#111827",
                  fillOpacity: 1,
                  strokeWeight: 0,
                  scale: 1.2,
                  anchor: new window.google.maps.Point(15, 15),
                },
              });
            } else {
              // Fallback: geocode from name
              const geocoder = new window.google.maps.Geocoder();
              geocoder.geocode({ address: restaurantName }, (results: any[], geoStatus: string) => {
                if (cancelled || geoStatus !== "OK" || !results[0]) return;
                const loc = results[0].geometry.location;
                map.setCenter(loc);
                new window.google.maps.Marker({ map, position: loc, title: restaurantName });
              });
            }
          }
        );
      } else {
        // Fallback: text search
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: restaurantName }, (results: any[], status: string) => {
          if (cancelled || status !== "OK" || !results[0]) return;
          const loc = results[0].geometry.location;
          map.setCenter(loc);
          new window.google.maps.Marker({ map, position: loc, title: restaurantName });
        });
      }
    }).catch(() => setError(true));

    return () => { cancelled = true; };
  }, [placeId, restaurantName]);

  if (error) {
    return (
      <div className="w-full h-full bg-[#f0ede8] flex items-center justify-center">
        <p className="text-sm text-gray-400">Map unavailable</p>
      </div>
    );
  }

  return <div ref={mapRef} className="w-full h-full" />;
}
