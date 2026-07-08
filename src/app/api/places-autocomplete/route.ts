import { NextResponse } from 'next/server';
import dns from 'dns';

// Force Node's DNS resolver to prioritize IPv4 over IPv6.
// This resolves the ConnectTimeoutError (UND_ERR_CONNECT_TIMEOUT) on networks
// with misconfigured or disabled IPv6 routing where fetch hangs when trying maps.googleapis.com.
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!query) {
    return NextResponse.json({ predictions: [] });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

  try {
    if (apiKey && apiKey !== 'YOUR_GOOGLE_PLACES_API_KEY') {
      try {
        // Use Google Places API with a timeout
        let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment&components=country:us&key=${apiKey}`;

        if (lat && lon) {
          url += `&location=${lat},${lon}&radius=20000`; // 20km radius
        }

        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const data = (await res.json()) as GoogleAutocompleteResponse;
        
        const predictions = (data.predictions || []).map((item) => ({
          name: item.description,
          place_id: item.place_id
        }));

        return NextResponse.json({ predictions });
      } catch (googleError) {
        console.error("Google Places Autocomplete failed, falling back to Nominatim:", googleError);
        // Fall through to Nominatim code instead of returning an empty array
      }
    }

    // Fallback to Nominatim if no API key is set, or if the Google call failed/timed out
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

    const res = await fetch(url, {
      headers: { 'User-Agent': 'GoogleReviewAnalyzer/1.0' },
      signal: AbortSignal.timeout(4000)
    });

    const data = (await res.json()) as NominatimPrediction[];
    const predictions = data.map((item) => ({
      name: item.display_name,
      place_id: item.place_id.toString()
    }));

    return NextResponse.json({ predictions });
  } catch (error) {
    console.error("Autocomplete error:", error);
    return NextResponse.json({ predictions: [] });
  }
}

