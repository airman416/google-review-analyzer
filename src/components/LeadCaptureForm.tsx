"use client";

import { useState } from "react";
import { buildApiUrl } from "@/lib/apiBaseUrl";

interface LeadCaptureFormProps {
  restaurantName: string;
  metrics: unknown;
  onSuccess: () => void;
}

export default function LeadCaptureForm({ restaurantName, metrics, onSuccess }: LeadCaptureFormProps) {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: restaurantName,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(buildApiUrl("/api/webhook"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lead: formData, metrics }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit form");
      }

      onSuccess();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border-brutal border-black shadow-brutal p-8 max-w-md w-full mx-auto relative" style={{ borderWidth: "3px" }}>
      <h2 className="text-2xl font-black uppercase mb-2">Get Your Owner.com Growth Plan</h2>
      <p className="font-bold mb-6">
        You already have the free audit. Enter your details and we&apos;ll help turn these findings into more direct orders, more reviews, and more repeat guests.
      </p>
      
      {error && <div className="bg-red-500 text-white p-3 font-bold mb-4 border-2 border-black">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-bold mb-1 uppercase text-sm">First Name</label>
            <input
              type="text"
              name="first_name"
              required
              className="w-full p-3 border-2 border-black focus:outline-none focus:bg-yellow-100 transition-colors"
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block font-bold mb-1 uppercase text-sm">Last Name</label>
            <input
              type="text"
              name="last_name"
              required
              className="w-full p-3 border-2 border-black focus:outline-none focus:bg-yellow-100 transition-colors"
              onChange={handleChange}
            />
          </div>
        </div>

        <div>
          <label className="block font-bold mb-1 uppercase text-sm">Email Address</label>
          <input
            type="email"
            name="email"
            required
            className="w-full p-3 border-2 border-black focus:outline-none focus:bg-yellow-100 transition-colors"
            onChange={handleChange}
          />
        </div>

        <div>
          <label className="block font-bold mb-1 uppercase text-sm">Phone Number</label>
          <input
            type="tel"
            name="phone"
            required
            pattern="[0-9]{10,15}"
            title="Please enter a valid phone number"
            className="w-full p-3 border-2 border-black focus:outline-none focus:bg-yellow-100 transition-colors"
            onChange={handleChange}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#ef4444] text-white p-4 font-black text-xl border-2 border-black hover:bg-red-600 active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all uppercase tracking-wider"
        >
          {loading ? "Sending..." : "Send Me My Owner.com Plan"}
        </button>
      </form>
    </div>
  );
}
