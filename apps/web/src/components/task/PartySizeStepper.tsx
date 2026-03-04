"use client";

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export function PartySizeStepper({ value, onChange, min = 1, max = 12 }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Party Size</label>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-700 hover:border-gray-400 disabled:opacity-40 transition-colors font-medium"
        >
          −
        </button>
        <span className="text-lg font-semibold text-gray-900 w-8 text-center">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-700 hover:border-gray-400 disabled:opacity-40 transition-colors font-medium"
        >
          +
        </button>
        <span className="text-sm text-gray-400">guests</span>
      </div>
    </div>
  );
}
