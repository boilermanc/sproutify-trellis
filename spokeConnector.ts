import { createClient } from '@supabase/supabase-js';
import { SpokeConnection } from './types';

type TestConnectionInput = Pick<SpokeConnection, 'supabase_url' | 'supabase_key' | 'table_name'>;

type TestConnectionResult =
  | { success: true; rowCount: number }
  | { success: false; error: string };

interface NormalizedSpokeProfile {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  subscribed?: boolean;
  created_at?: string;
  _spoke_id: string;
  _spoke_name: string;
}

export async function testSpokeConnection(
  connection: TestConnectionInput
): Promise<TestConnectionResult> {
  try {
    const client = createClient(connection.supabase_url, connection.supabase_key);

    const { data, error, count } = await client
      .from(connection.table_name)
      .select('*', { count: 'exact', head: false })
      .limit(1);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, rowCount: count ?? data?.length ?? 0 };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}

export async function fetchSpokeProfiles(
  connection: SpokeConnection
): Promise<NormalizedSpokeProfile[]> {
  try {
    const client = createClient(connection.supabase_url, connection.supabase_key);

    // Build the select string from field_mapping
    const fieldMapping = connection.field_mapping;
    const selectFields: string[] = [];

    // Always include email (required)
    selectFields.push(fieldMapping.email);

    // Add optional fields if they exist in the mapping
    if (fieldMapping.first_name) selectFields.push(fieldMapping.first_name);
    if (fieldMapping.last_name) selectFields.push(fieldMapping.last_name);
    if (fieldMapping.phone) selectFields.push(fieldMapping.phone);
    if (fieldMapping.subscribed) selectFields.push(fieldMapping.subscribed);
    if (fieldMapping.created_at) selectFields.push(fieldMapping.created_at);

    const { data, error } = await client
      .from(connection.table_name)
      .select(selectFields.join(', '))
      .limit(1000);

    if (error) {
      console.error(`Error fetching from spoke ${connection.name}:`, error.message);
      return [];
    }

    if (!data) {
      return [];
    }

    // Normalize the data to our standard profile shape
    return data.map((row: Record<string, unknown>) => {
      const profile: NormalizedSpokeProfile = {
        email: String(row[fieldMapping.email] ?? ''),
        _spoke_id: connection.id,
        _spoke_name: connection.name,
      };

      if (fieldMapping.first_name && row[fieldMapping.first_name] !== undefined) {
        profile.first_name = String(row[fieldMapping.first_name]);
      }

      if (fieldMapping.last_name && row[fieldMapping.last_name] !== undefined) {
        profile.last_name = String(row[fieldMapping.last_name]);
      }

      if (fieldMapping.phone && row[fieldMapping.phone] !== undefined) {
        profile.phone = String(row[fieldMapping.phone]);
      }

      if (fieldMapping.subscribed && row[fieldMapping.subscribed] !== undefined) {
        profile.subscribed = Boolean(row[fieldMapping.subscribed]);
      }

      if (fieldMapping.created_at && row[fieldMapping.created_at] !== undefined) {
        profile.created_at = String(row[fieldMapping.created_at]);
      }

      return profile;
    });
  } catch (err) {
    console.error(
      `Error fetching from spoke ${connection.name}:`,
      err instanceof Error ? err.message : 'Unknown error'
    );
    return [];
  }
}

export async function fetchAllSpokesProfiles(
  connections: SpokeConnection[]
): Promise<NormalizedSpokeProfile[]> {
  // Filter to only active connections
  const activeConnections = connections.filter((c) => c.status === 'active');

  // Fetch from all spokes in parallel
  const results = await Promise.all(
    activeConnections.map((connection) => fetchSpokeProfiles(connection))
  );

  // Merge all results into a single array
  return results.flat();
}
