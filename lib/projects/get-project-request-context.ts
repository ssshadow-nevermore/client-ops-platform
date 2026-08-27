import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";
import { createClient } from "@/lib/supabase/server";

import { getProjectContext, type ProjectContext } from "./get-project-context";

export type ProjectRequestContext = {
  context: ProjectContext | null;
  supabase: SupabaseClient;
  user: User | null;
};

/**
 * Deduplicates the auth and project access chain for a project request.
 * React's server cache is request-scoped in the App Router, so this does not
 * persist authentication or authorization state between requests.
 */
export const getProjectRequestContext = cache(
  async (projectId: string): Promise<ProjectRequestContext> => {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return { context: null, supabase, user: null };
    }

    const context = await getProjectContext(supabase, projectId, user.id);

    return { context, supabase, user };
  },
);
