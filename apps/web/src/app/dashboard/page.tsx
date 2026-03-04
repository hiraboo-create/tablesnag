"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTasks, cancelTask, updateTask } from "@/hooks/useTasks";
import { BookingTaskCard } from "@/components/task/BookingTaskCard";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const { tasks, isLoading } = useTasks(1, activeTab === "active" ? "MONITORING" : undefined);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          Table<span className="text-red-500">Snag</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{session?.user?.email}</span>
          <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">
            Settings
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <Link
            href="/tasks/new"
            className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors"
          >
            + New Task
          </Link>
        </div>

        <div className="flex gap-2 border-b border-gray-200">
          {(["active", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-red-500 border-b-2 border-red-500"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "active" ? "Active Tasks" : "Booking History"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-gray-400">
              {activeTab === "active"
                ? "No active tasks. Create one to start monitoring."
                : "No bookings yet."}
            </p>
            {activeTab === "active" && (
              <Link href="/tasks/new" className="text-red-500 hover:underline text-sm">
                Create your first task
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <BookingTaskCard
                key={task.id}
                task={task}
                onPause={() => updateTask(task.id, { status: "PAUSED" })}
                onResume={() => updateTask(task.id, { status: "MONITORING" })}
                onCancel={() => cancelTask(task.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
