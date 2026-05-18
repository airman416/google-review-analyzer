import cors from "cors";
import express from "express";

import { analyzeRestaurantHandler } from "./analyzeRestaurant";
import { placesAutocompleteHandler } from "./placesAutocomplete";
import { webhookHandler } from "./webhook";

type AnalyzeRestaurantHandler = typeof analyzeRestaurantHandler;

interface AppOptions {
  analyzeRestaurantHandler?: AnalyzeRestaurantHandler;
}

function getAllowedOrigins() {
  const origin = process.env.CORS_ORIGIN;

  if (!origin) {
    return true;
  }

  return origin.split(",").map((item) => item.trim()).filter(Boolean);
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const analyzeHandler = options.analyzeRestaurantHandler ?? analyzeRestaurantHandler;

  app.use(cors({ origin: getAllowedOrigins() }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/api/analyze-restaurant", analyzeHandler);
  app.get("/api/places-autocomplete", placesAutocompleteHandler);
  app.post("/api/webhook", webhookHandler);

  return app;
}
