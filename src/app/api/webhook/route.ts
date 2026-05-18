import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lead, metrics } = body;

    // Validate
    if (!lead || !lead.email || !lead.phone) {
      return NextResponse.json({ error: 'Invalid lead data' }, { status: 400 });
    }

    const payload = {
      lead,
      metrics
    };

    const webhookUrl = process.env.WEBHOOK_URL;
    if (webhookUrl && webhookUrl !== 'https://dummy-webhook.owner.com/leads') {
      await axios.post(webhookUrl, payload);
    } else {
      console.log('Mock Webhook Fired:', payload);
    }

    return NextResponse.json({ success: true, message: 'Lead routed successfully' });

  } catch (error) {
    console.error("Error routing lead:", error);
    return NextResponse.json({ error: 'Failed to route lead' }, { status: 500 });
  }
}
