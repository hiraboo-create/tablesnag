import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900">
          Table<span className="text-red-500">Snag</span>
        </h1>
        <p className="text-xl text-gray-600">
          Stop refreshing. Start dining. TableSnag monitors Resy and OpenTable
          and books your reservation the moment a table opens up.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/auth/register"
            className="px-6 py-3 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/auth/login"
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:border-gray-400 transition-colors"
          >
            Sign In
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-6 mt-12 text-left">
          {[
            { title: "Connect Accounts", desc: "Link your Resy and OpenTable credentials securely." },
            { title: "Set Your Criteria", desc: "Choose restaurant, dates, times, and party size." },
            { title: "Auto-Book", desc: "We monitor every 30 seconds and book the moment a slot appears." },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
