"use client";

import type { BookingTask } from "@tablesnag/shared";
import { TaskStatus, TASK_STATUS_LABELS } from "@tablesnag/shared";

const STATUS_STYLES: Record<TaskStatus, string> = {
  [TaskStatus.MONITORING]: "bg-green-50 text-green-700",
  [TaskStatus.PAUSED]: "bg-yellow-50 text-yellow-700",
  [TaskStatus.BOOKED]: "bg-blue-50 text-blue-700",
  [TaskStatus.FAILED]: "bg-red-50 text-red-700",
  [TaskStatus.CANCELLED]: "bg-gray-50 text-gray-500",
};

interface Props {
  task: BookingTask;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export function BookingTaskCard({ task, onPause, onResume, onCancel }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-start justify-between gap-4">
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 truncate">{task.restaurantName}</h3>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[task.status as TaskStatus]}`}
          >
            {TASK_STATUS_LABELS[task.status as TaskStatus]}
          </span>
        </div>
        <p className="text-sm text-gray-400 truncate">{task.restaurantAddress}</p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span>
            {new Date(task.dateRangeStart).toLocaleDateString()} →{" "}
            {new Date(task.dateRangeEnd).toLocaleDateString()}
          </span>
          <span>
            {task.timeWindowStart}–{task.timeWindowEnd}
          </span>
          <span>{task.partySize} guests</span>
          <span>{task.platforms.join(", ")}</span>
        </div>
        {task.lastCheckedAt && (
          <p className="text-xs text-gray-300">
            Last checked {new Date(task.lastCheckedAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      {task.status !== TaskStatus.BOOKED && task.status !== TaskStatus.CANCELLED && (
        <div className="flex flex-col gap-1 flex-shrink-0">
          {task.status === TaskStatus.MONITORING ? (
            <button
              onClick={onPause}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:border-gray-300 transition-colors"
            >
              Pause
            </button>
          ) : (
            <button
              onClick={onResume}
              className="text-xs px-3 py-1.5 border border-green-200 rounded-lg text-green-700 hover:border-green-300 transition-colors"
            >
              Resume
            </button>
          )}
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 border border-red-100 rounded-lg text-red-500 hover:border-red-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
