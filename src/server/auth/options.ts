import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authenticateCredentials } from "@/server/auth/accounts";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize(credentials) {
        return authenticateCredentials(credentials);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }

      return session;
    },
    redirect({ url, baseUrl }) {
      const destination = new URL(url, baseUrl);
      const allowedPaths = new Set(["/auth/continue", "/login"]);

      if (destination.origin === baseUrl && allowedPaths.has(destination.pathname)) {
        return destination.toString();
      }

      return new URL("/auth/continue", baseUrl).toString();
    },
  },
};
