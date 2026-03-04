import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
      if (user) {
        token.accessToken = (user as { accessToken?: string }).accessToken;
        token.refreshToken = (user as { refreshToken?: string }).refreshToken;
        token.sub = user.id;
      }
      return token;
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
