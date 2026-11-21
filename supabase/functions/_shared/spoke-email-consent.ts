import { createClient } from "jsr:@supabase/supabase-js@2";

const REKKRD_SCOPE = "rekkrd";
const REKKRD_PROJECT_REF = "cvqqiuhloefvaaacwxkg";

export interface ConsentWriteBackResult {
  attempted: boolean;
  updated: boolean;
  error?: string;
}

// Hub suppression is the authoritative safety control. This best-effort mirror
// keeps Rekkrd's native preferences consistent without exposing a generic spoke
// write endpoint: project, table, identity key, and writable columns are fixed.
export async function writeBackBranchUnsubscribe(
  hub: any,
  email: string,
  scope: string,
): Promise<ConsentWriteBackResult> {
  const normalizedScope = String(scope || "global").trim().toLowerCase();
  if (normalizedScope !== REKKRD_SCOPE && normalizedScope !== "global") {
    return { attempted: false, updated: false };
  }

  try {
    const { data: branch, error: branchError } = await hub
      .from("branches")
      .select("spoke_connection_id")
      .eq("slug", REKKRD_SCOPE)
      .maybeSingle();
    if (branchError || !branch?.spoke_connection_id) {
      throw new Error(branchError?.message || "Rekkrd spoke connection is not configured");
    }

    const { data: connection, error: connectionError } = await hub
      .from("spoke_connections")
      .select("supabase_url,status")
      .eq("id", branch.spoke_connection_id)
      .maybeSingle();
    if (connectionError || !connection?.supabase_url || connection.status !== "active") {
      throw new Error(connectionError?.message || "Rekkrd spoke connection is unavailable");
    }

    const spokeUrl = String(connection.supabase_url);
    if (!spokeUrl.includes(REKKRD_PROJECT_REF)) {
      throw new Error("Rekkrd spoke project validation failed");
    }

    const { data: spokeKey, error: keyError } = await hub.rpc("get_spoke_connection_key", {
      p_connection_id: branch.spoke_connection_id,
    });
    if (keyError || !spokeKey) throw new Error(keyError?.message || "Rekkrd spoke key is unavailable");

    const spoke = createClient(spokeUrl, String(spokeKey), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error: updateError } = await spoke
      .from("profiles")
      .update({ email_digest_optin: false, email_updates_optin: false })
      .eq("email", email.trim().toLowerCase())
      .select("id");
    if (updateError) throw new Error(updateError.message);

    return { attempted: true, updated: Array.isArray(data) && data.length > 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Rekkrd consent write-back failure";
    // Never log the address. The Hub suppression has already succeeded, so this
    // is operationally visible without turning a spoke outage into a re-mail risk.
    console.error("Rekkrd unsubscribe write-back failed:", message);
    return { attempted: true, updated: false, error: message };
  }
}
