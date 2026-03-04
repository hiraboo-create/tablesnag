"use client";

interface Props {
  value: { start: string; end: string };
  onChange: (value: { start: string; end: string }) => void;
}

const MAX_DAYS = 7;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DateRangePicker({ value, onChange }: Props) {
  const maxEnd = value.start ? addDays(value.start, MAX_DAYS) : "";

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">Date Range</label>
      <p className="text-xs text-gray-400">Select up to 7 future dates to monitor</p>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">From</label>
          <input
            type="date"
            min={today()}
            value={value.start}
            onChange={(e) => {
              const start = e.target.value;
              const end = value.end && value.end > addDays(start, MAX_DAYS)
                ? addDays(start, MAX_DAYS)
                : value.end;
              onChange({ start, end });
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-400 mb-1">To</label>
          <input
            type="date"
            min={value.start || today()}
            max={maxEnd}
            value={value.end}
            disabled={!value.start}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}
