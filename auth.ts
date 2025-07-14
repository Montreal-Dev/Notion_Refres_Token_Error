import NextAuth, { DefaultSession, Session } from "next-auth";
import { JWT } from "next-auth/jwt";
import "next-auth/jwt";

import Notion from "next-auth/providers/notion";
import { NextResponse } from "next/server";

const isProduction = process.env.NODE_ENV === "production";
const prependSecure = isProduction ? true : false;
const prependHost = isProduction ? "__Host-" : "";
const cookieSitePolicy = isProduction ? "lax" : "none";
const cookieSecurePolicy = isProduction;
const cookiePartitionedPolicy = isProduction ? true : undefined;

export const authProviderLinked = {
  notion: "notion",
} as const;

const authType = (linkType: string | null) => {
  if (linkType === "notion") return authProviderLinked.notion;
  return null;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: !!process.env.AUTH_DEBUG,
  theme: { logo: "https://authjs.dev/img/logo-sm.png" },
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signOut: "/",
  },
  providers: [
    Notion({
      id: authProviderLinked.notion,
      clientId: process.env.AUTH_NOTION_ID!,
      clientSecret: process.env.AUTH_NOTION_SECRET!,
      redirectUri: process.env.AUTH_NOTION_REDIRECT_URI ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token = {
          ...token,
          access_token: account.access_token,
          bot_id: account.bot_id!.toString(),
          authType: authType(account.provider),
          workspace: {
            id: account.workspace_id!.toString(),
            name: account.workspace_name!.toString() as string,
            icon: account.workspace_icon?.toString() ?? null,
          },
        };
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      session.user = {
        ...session.user,
        authType: authType(token.authType),
        workspace: { name: token.workspace.name, icon: token.workspace.icon },
      };
      if ("access_token" in session) {
        throw new Error("access_token exposed");
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: `${prependSecure}authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: cookieSitePolicy,
        secure: cookieSecurePolicy,
        partitioned: cookiePartitionedPolicy,
      },
    },
    callbackUrl: {
      name: `${prependSecure}authjs.callback-url`,
      options: {
        sameSite: cookieSitePolicy,
        secure: cookieSecurePolicy,
        partitioned: cookiePartitionedPolicy,
      },
    },
    csrfToken: {
      name: `${prependHost}authjs.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: cookieSitePolicy,
        secure: cookieSecurePolicy,
        partitioned: cookiePartitionedPolicy,
      },
    },
  },
});

type WorkSpace = {
  id: string;
  name: string;
  icon: string | null;
};

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: DefaultSession["user"] & {
      authType: "notion" | "handshake" | null;
      workspace: Omit<WorkSpace, "id">;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token: string;
    type: string;
    bot_id: string;
    workspace: WorkSpace;
    exp_at: number;
    authType: "notion" | null;
  }
}
