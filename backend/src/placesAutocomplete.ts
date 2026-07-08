import type { Request, Response } from "express";
import dns from "dns";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

interface GooglePrediction {
  description: string;
  place_id: string;
}

interface GoogleAutocompleteResponse {
  predictions?: GooglePrediction[];
}

interface NominatimPrediction {
  display_name: string;
  place_id: number | string;
}

export async function placesAutocompleteHandler(request: Request, response: Response) {
  const query = typeof request.query.q === "string" ? request.query.q : "";
  const lat = typeof request.query.lat === "string" ? request.query.lat : null;
  const lon = typeof request.query.lon === "string" ? request.query.lon : null;

  if (!query) {
    return response.json({ predictions: [] });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

  try {
    if (apiKey && apiKey !== "YOUR_GOOGLE_PLACES_API_KEY") {
      try {
        let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment&components=country:us&key=${apiKey}`;

        if (lat && lon) {
          url += `&location=${lat},${lon}&radius=20000`;
        }

        const placesResponse = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const data = (await placesResponse.json()) as GoogleAutocompleteResponse;
        const predictions = (data.predictions || []).map((item) => ({
          name: item.description,
          place_id: item.place_id,
        }));

        return response.json({ predictions });
      } catch (googleError) {
        console.error("Google Places Autocomplete failed, falling back to Nominatim:", googleError);
        // Fall through to Nominatim code instead of returning an empty array
      }
    }

    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&accept-language=en&countrycodes=us`;

    if (lat && lon) {
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      const left = lonNum - 0.2;
      const right = lonNum + 0.2;
      const top = latNum + 0.2;
      const bottom = latNum - 0.2;
      url += `&viewbox=${left},${top},${right},${bottom}&bounded=0`;
    }

    const nominatimResponse = await fetch(url, {
      headers: { "User-Agent": "GoogleReviewAnalyzer/1.0" },
      signal: AbortSignal.timeout(4000)
    });

    const data = (await nominatimResponse.json()) as NominatimPrediction[];
    const predictions = data.map((item) => ({
      name: item.display_name,
      place_id: item.place_id.toString(),
    }));

    return response.json({ predictions });
  } catch (error) {
    console.error("Autocomplete error:", error);
    return response.json({ predictions: [] });
  }
}

