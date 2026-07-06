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
    <div className="bg-white border border-[#dfdcd9] rounded-2xl p-8 shadow-2xl max-w-md w-full mx-auto relative">
      <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">Get Your Owner.com Growth Plan</h2>
      <p className="text-sm text-gray-600 mb-6 font-normal">
        You already have the free audit. Enter your details and we&apos;ll help turn these findings into more direct orders, more reviews, and more repeat guests.
      </p>
      
      {error && <div className="bg-red-50 border border-red-200 text-[#c2410c] p-3 rounded-lg text-sm font-semibold mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-bold text-xs text-gray-500 mb-1.5 uppercase tracking-wider">First Name</label>
            <input
              type="text"
              name="first_name"
              required
              className="w-full p-3 border border-[#dfdcd9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#094413]/20 focus:border-[#094413] transition-all bg-gray-50/50 focus:bg-white text-black"
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block font-bold text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Last Name</label>
            <input
              type="text"
              name="last_name"
              required
              className="w-full p-3 border border-[#dfdcd9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#094413]/20 focus:border-[#094413] transition-all bg-gray-50/50 focus:bg-white text-black"
              onChange={handleChange}
            />
          </div>
        </div>

        <div>
          <label className="block font-bold text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Email Address</label>
          <input
            type="email"
            name="email"
            required
            className="w-full p-3 border border-[#dfdcd9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#094413]/20 focus:border-[#094413] transition-all bg-gray-50/50 focus:bg-white text-black"
            onChange={handleChange}
          />
        </div>

        <div>
          <label className="block font-bold text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Phone Number</label>
          <input
            type="tel"
            name="phone"
            required
            pattern="[0-9]{10,15}"
            title="Please enter a valid phone number"
            className="w-full p-3 border border-[#dfdcd9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#094413]/20 focus:border-[#094413] transition-all bg-gray-50/50 focus:bg-white text-black"
            onChange={handleChange}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#094413] hover:bg-[#115c1e] active:scale-[0.98] text-white p-4 font-bold text-base rounded-xl transition-all uppercase tracking-wider cursor-pointer shadow-sm mt-2"
        >
          {loading ? "Sending..." : "Send Me My Owner.com Plan"}
        </button>
      </form>
    </div>
  );
}
