"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/lib/api";

const schema = z.object({ email: z.string().email("Invalid email") });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    await api.post("/auth/forgot-password", data, false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Check your inbox</h2>
          <p className="text-gray-500 text-sm">
            If an account exists for that email, we sent a reset link.
          </p>
          <Link href="/auth/login" className="text-red-500 hover:underline text-sm">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forgot password</h1>
          <p className="text-gray-500 text-sm mt-1">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              {...register("email")}
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-500 text-white rounded-lg py-2.5 font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
        <Link href="/auth/login" className="block text-center text-sm text-gray-500 hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
