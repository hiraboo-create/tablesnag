"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { RestaurantSearchBar } from "@/components/restaurant/RestaurantSearchBar";
import { RestaurantConfirmCard } from "@/components/restaurant/RestaurantConfirmCard";
import { DateRangePicker } from "@/components/task/DateRangePicker";
import { TimeWindowSlider } from "@/components/task/TimeWindowSlider";
import { PartySizeStepper } from "@/components/task/PartySizeStepper";
import { createTask } from "@/hooks/useTasks";
import { api } from "@/lib/api";
import type { AutocompleteResult, PlaceDetails, GetPlaceDetailsResponse } from "@tablesnag/shared";
import { Platform } from "@tablesnag/shared";

const STEPS = ["Restaurant", "Details", "Confirm"] as const;
type Step = (typeof STEPS)[number];

export default function NewTaskPage() {
  const router = useRouter();
  const { status } = useSession({ required: true });

  const [step, setStep] = useState<Step>("Restaurant");
  const [selectedPlace, setSelectedPlace] = useState<AutocompleteResult | null>(null);
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const [timeWindow, setTimeWindow] = useState<{ start: string; end: string }>({
    start: "18:00",
    end: "21:00",
  });
  const [partySize, setPartySize] = useState(2);
  const [platforms, setPlatforms] = useState<Platform[]>([Platform.RESY, Platform.OPENTABLE]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") return null;

  const handleSelectRestaurant = async (result: AutocompleteResult) => {
    setSelectedPlace(result);
    try {
      const res = await api.get<GetPlaceDetailsResponse>(`/restaurants/${result.placeId}`);
      setPlaceDetails(res.data);
    } catch {
      // Use autocomplete result as fallback
    }
    setStep("Details");
  };

  const handleSubmit = async () => {
    if (!selectedPlace || !dateRange.start || !dateRange.end) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createTask({
        restaurantId: selectedPlace.placeId,
        restaurantName:
          placeDetails?.name ?? selectedPlace.structuredFormatting.mainText,
        restaurantAddress:
          placeDetails?.address ?? selectedPlace.structuredFormatting.secondaryText,
        platforms,
        partySize,
        dateRangeStart: dateRange.start,
        dateRangeEnd: dateRange.end,
        timeWindowStart: timeWindow.start,
        timeWindowEnd: timeWindow.end,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">
          Table<span className="text-red-500">Snag</span>
        </h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Step indicator */}
        <div className="flex gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                  s === step
                    ? "bg-red-500 text-white"
                    : STEPS.indexOf(step) > i
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {i + 1}
              </div>
              <span className="text-sm text-gray-600">{s}</span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        {step === "Restaurant" && (
          <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Find a restaurant</h2>
            <RestaurantSearchBar onSelect={handleSelectRestaurant} />
          </div>
        )}

        {step === "Details" && selectedPlace && (
          <div className="space-y-4">
            {placeDetails && <RestaurantConfirmCard details={placeDetails} />}

            <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-6">
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              <TimeWindowSlider value={timeWindow} onChange={setTimeWindow} />
              <PartySizeStepper value={partySize} onChange={setPartySize} />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Platforms</label>
                <div className="flex gap-3">
                  {[Platform.RESY, Platform.OPENTABLE].map((p) => (
                    <button
                      key={p}
                      onClick={() =>
                        setPlatforms((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                        )
                      }
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        platforms.includes(p)
                          ? "bg-red-50 border-red-300 text-red-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {p === Platform.RESY ? "Resy" : "OpenTable"}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep("Confirm")}
                disabled={!dateRange.start || !dateRange.end || platforms.length === 0}
                className="w-full bg-red-500 text-white rounded-lg py-2.5 font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "Confirm" && (
          <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Confirm task</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Restaurant</dt>
                <dd className="font-medium text-gray-900">
                  {placeDetails?.name ?? selectedPlace?.structuredFormatting.mainText}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Dates</dt>
                <dd className="font-medium text-gray-900">
                  {dateRange.start} → {dateRange.end}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Time window</dt>
                <dd className="font-medium text-gray-900">
                  {timeWindow.start} – {timeWindow.end}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Party size</dt>
                <dd className="font-medium text-gray-900">{partySize}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Platforms</dt>
                <dd className="font-medium text-gray-900">{platforms.join(", ")}</dd>
              </div>
            </dl>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("Details")}
                className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 font-semibold hover:border-gray-300 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 bg-red-500 text-white rounded-lg py-2.5 font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Creating..." : "Start Monitoring"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
