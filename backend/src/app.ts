import cors from "cors";
import express from "express";

import { analyzeRestaurantHandler } from "./analyzeRestaurant";
import { placesAutocompleteHandler } from "./placesAutocomplete";
import { webhookHandler } from "./webhook";

function getAllowedOrigins() {
  const origin = process.env.CORS_ORIGIN;

  if (!origin) {
    return true;
  }

  return origin.split(",").map((item) => item.trim()).filter(Boolean);
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: getAllowedOrigins() }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/api/analyze-restaurant", analyzeRestaurantHandler);
  app.get("/api/places-autocomplete", placesAutocompleteHandler);
  app.post("/api/webhook", webhookHandler);

  return app;
}
