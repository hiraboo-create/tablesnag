import { TaskStatus } from "../types/task";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.MONITORING]: "Monitoring",
  [TaskStatus.PAUSED]: "Paused",
  [TaskStatus.BOOKED]: "Booked",
  [TaskStatus.FAILED]: "Failed",
  [TaskStatus.CANCELLED]: "Cancelled",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.MONITORING]: "green",
  [TaskStatus.PAUSED]: "yellow",
  [TaskStatus.BOOKED]: "blue",
  [TaskStatus.FAILED]: "red",
  [TaskStatus.CANCELLED]: "gray",
};

// Polling intervals in milliseconds
export const POLL_INTERVAL_PEAK = 30_000; // 30s between 9AM-11PM
export const POLL_INTERVAL_OFF_PEAK = 300_000; // 5min outside those hours
export const PEAK_HOURS_START = 9; // 9 AM
export const PEAK_HOURS_END = 23; // 11 PM
