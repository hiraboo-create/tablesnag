"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { api } from "@/lib/api";
import type { GetTasksResponse, BookingTask, CreateTaskRequest, UpdateTaskRequest } from "@tablesnag/shared";

const TASKS_KEY = "/tasks";

function tasksFetcher(path: string) {
  return api.get<GetTasksResponse>(path).then((r) => r);
}

export function useTasks(page = 1, status?: string) {
  const key = `${TASKS_KEY}?page=${page}${status ? `&status=${status}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR(key, tasksFetcher);

  return {
    tasks: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
    mutate,
  };
}

export async function createTask(body: CreateTaskRequest): Promise<BookingTask> {
  const res = await api.post<{ data: BookingTask }>(TASKS_KEY, body);
  await globalMutate((key: string) => typeof key === "string" && key.startsWith(TASKS_KEY));
  return res.data;
}

export async function updateTask(id: string, body: UpdateTaskRequest): Promise<BookingTask> {
  const res = await api.patch<{ data: BookingTask }>(`${TASKS_KEY}/${id}`, body);
  await globalMutate((key: string) => typeof key === "string" && key.startsWith(TASKS_KEY));
  return res.data;
}

export async function cancelTask(id: string): Promise<void> {
  await api.delete(`${TASKS_KEY}/${id}`);
  await globalMutate((key: string) => typeof key === "string" && key.startsWith(TASKS_KEY));
}
