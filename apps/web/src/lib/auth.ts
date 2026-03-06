import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Decode the exp claim from a JWT without verifying the signature. */
function jwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    });
    if (!res.ok) throw new Error("Refresh failed");
    const { data } = await res.json();
    const newAccess: string = data.accessToken;
    return {
      ...token,
      accessToken: newAccess,
      refreshToken: data.refreshToken,
      accessTokenExpires: jwtExpiry(newAccess),
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
    newUser: "/onboarding",
  },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const res = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
        });

        if (!res.ok) return null;

        const { data } = await res.json();
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // New sign-in
      if (user) {
        const accessToken = (user as { accessToken?: string }).accessToken ?? "";
        token.accessToken = accessToken;
        token.refreshToken = (user as { refreshToken?: string }).refreshToken;
        token.sub = user.id;
        // Read actual expiry from the JWT itself
        token.accessTokenExpires = jwtExpiry(accessToken);
      }

      // Still valid (with 60s buffer before actual expiry)?
      if (Date.now() < ((token.accessTokenExpires as number ?? 0) - 60_000)) {
        return token;
      }

      // Expired (or stale session without proper expiry set) — refresh now
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      (session as { accessToken?: string }).accessToken = token.accessToken as string;
      (session as { refreshToken?: string }).refreshToken = token.refreshToken as string;
      if (session.user) {
        session.user.name = token.name ?? session.user.name;
      }
      return session;
    },
  },
};
