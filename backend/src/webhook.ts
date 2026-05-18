import axios from "axios";
import type { Request, Response } from "express";

export async function webhookHandler(request: Request, response: Response) {
  try {
    const { lead, metrics } = request.body;

    if (!lead || !lead.email || !lead.phone) {
      return response.status(400).json({ error: "Invalid lead data" });
    }

    const payload = { lead, metrics };
    const webhookUrl = process.env.WEBHOOK_URL;

    if (webhookUrl && webhookUrl !== "https://dummy-webhook.owner.com/leads") {
      await axios.post(webhookUrl, payload);
    } else {
      console.log("Mock Webhook Fired:", payload);
    }

    return response.json({ success: true, message: "Lead routed successfully" });
  } catch (error) {
    console.error("Error routing lead:", error);
    return response.status(500).json({ error: "Failed to route lead" });
  }
}
