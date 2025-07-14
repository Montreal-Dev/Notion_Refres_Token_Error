import NextAuth, { DefaultSession, Session } from "next-auth";
import { JWT } from "next-auth/jwt";
import "next-auth/jwt";

import Notion from "next-auth/providers/notion";
import { NextResponse } from "next/server";

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
      token: {
        url: "https://api.notion.com/v1/oauth/token",
        conform: async (response: NextResponse) => {
          const json = await response.clone().json();
          if (!json.refresh_token || typeof json.refresh_token !== "string") {
            delete json.refresh_token;
          }
          return new Response(JSON.stringify(json), {
            status: response.status,
            headers: response.headers,
          });
        },
      },
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
