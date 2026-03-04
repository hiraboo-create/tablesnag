"use client";

interface Props {
  value: { start: string; end: string };
  onChange: (value: { start: string; end: string }) => void;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i;
  const label = hour === 0
    ? "12 AM"
    : hour < 12
    ? `${hour} AM`
    : hour === 12
    ? "12 PM"
    : `${hour - 12} PM`;
  const value = `${String(hour).padStart(2, "0")}:00`;
  return { value, label };
});

export function TimeWindowSlider({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">Time Window</label>
      <p className="text-xs text-gray-400">
        We&apos;ll only book slots within this window
      </p>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">From</label>
          <select
            value={value.start}
            onChange={(e) => {
              const start = e.target.value;
              // Ensure end is after start
              const startHour = parseInt(start, 10);
              const endHour = parseInt(value.end, 10);
              const end = endHour <= startHour
                ? HOUR_OPTIONS[Math.min(startHour + 2, 23)].value
                : value.end;
              onChange({ start, end });
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {HOUR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <span className="text-gray-400 text-sm mt-4">–</span>

        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">To</label>
          <select
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {HOUR_OPTIONS.filter((o) => o.value > value.start).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-xs text-center text-gray-400">
        Selected: {value.start} – {value.end}
      </div>
    </div>
  );
}
