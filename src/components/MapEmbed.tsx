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
  return new Promise((resolve, reject) => {
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
    script.onerror = () => {
      window._mapsLoading = false;
      reject(new Error("Failed to load Google Maps script"));
    };
    document.head.appendChild(script);
  });
}

export default function MapEmbed({ placeId, restaurantName }: MapEmbedProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(() => !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    let cancelled = false;

    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapRef.current) return;

      const map = new window.google.maps.Map(mapRef.current, {
        zoom: 16,
        center: { lat: 39.8283, lng: -98.5795 },
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const animateMapToLocation = (location: any, title: string, customIcon?: any) => {
        if (cancelled) return;
        
        map.setCenter(location);
        map.setZoom(16);

        new window.google.maps.Marker({
          map,
          position: location,
          title,
          ...(customIcon ? { icon: customIcon } : {}),
        });

        setMapReady(true);

        let currentZoom = 16;
        const targetZoom = 19;
        
        const zoomStep = () => {
          if (cancelled) return;
          if (currentZoom < targetZoom) {
            currentZoom++;
            map.setZoom(currentZoom);
            setTimeout(zoomStep, 250);
          }
        };
        
        // Start zooming after the map is shown at zoom 16 for a bit
        setTimeout(zoomStep, 800);
      };

      const service = new window.google.maps.places.PlacesService(map);

      const isValidPlaceId = placeId && !placeId.startsWith("search-");

      if (isValidPlaceId) {
        service.getDetails(
          { placeId, fields: ["geometry", "name", "formatted_address"] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (place: any, status: string) => {
            if (cancelled) return;
            if (status === "OK" && place?.geometry?.location) {
              const customIcon = {
                path: "M15 3 L17.5 13.5 L27 15 L17.5 16.5 L15 27 L12.5 16.5 L3 15 L12.5 13.5 Z",
                fillColor: "#111827",
                fillOpacity: 1,
                strokeWeight: 0,
                scale: 1.2,
                anchor: new window.google.maps.Point(15, 15),
              };
              animateMapToLocation(place.geometry.location, place.name, customIcon);
            } else {
              // Fallback: geocode from name
              const geocoder = new window.google.maps.Geocoder();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              geocoder.geocode({ address: restaurantName }, (results: any[], geoStatus: string) => {
                if (cancelled || geoStatus !== "OK" || !results[0]) return;
                animateMapToLocation(results[0].geometry.location, restaurantName);
              });
            }
          }
        );
      } else {
        // Fallback: text search
        const geocoder = new window.google.maps.Geocoder();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        geocoder.geocode({ address: restaurantName }, (results: any[], status: string) => {
          if (cancelled || status !== "OK" || !results[0]) return;
          animateMapToLocation(results[0].geometry.location, restaurantName);
        });
      }
    }).catch(() => setError(true));

    return () => { cancelled = true; };
  }, [placeId, restaurantName]);

  if (error) {
    const iframeUrl = `https://maps.google.com/maps?q=${encodeURIComponent(restaurantName)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    return (
      <iframe
        title={restaurantName}
        src={iframeUrl}
        className="w-full h-full border-0"
        allowFullScreen
        loading="lazy"
      />
    );
  }

  return (
    <div className="relative w-full h-full">
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#faf8f5]">
          <div className="w-8 h-8 border-3 border-[#094413] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div 
        ref={mapRef} 
        className={`w-full h-full transition-opacity duration-500 ${mapReady ? 'opacity-100' : 'opacity-0'}`} 
      />
    </div>
  );
}
