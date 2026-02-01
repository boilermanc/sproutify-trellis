import { createClient } from '@supabase/supabase-js';
import { SpokeConnection } from './types';

type TestConnectionInput = Pick<SpokeConnection, 'supabase_url' | 'supabase_key' | 'table_name'>;

type TestConnectionResult =
  | { success: true; rowCount: number; columns: string[] }
  | { success: false; error: string };

export interface NormalizedSpokeProfile {
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

    // Extract column names from the first row of data
    const columns = data && data.length > 0 ? Object.keys(data[0]) : [];

    return { success: true, rowCount: count ?? data?.length ?? 0, columns };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}

export interface AutoMapResult {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  subscribed: string;
  created_at: string;
}

export interface AutoMapFieldsResult {
  mapping: AutoMapResult;
  matched: string[];
  unmatched: string[];
}

// Pattern definitions for field matching
const FIELD_PATTERNS: Record<keyof AutoMapResult, RegExp[]> = {
  email: [/^email$/i, /^e[-_]?mail$/i, /^email[-_]?address$/i, /^user[-_]?email$/i],
  first_name: [/^first[-_]?name$/i, /^fname$/i, /^given[-_]?name$/i, /^forename$/i],
  last_name: [/^last[-_]?name$/i, /^lname$/i, /^surname$/i, /^family[-_]?name$/i],
  phone: [/^phone$/i, /^phone[-_]?number$/i, /^mobile$/i, /^cell$/i, /^telephone$/i, /^tel$/i],
  subscribed: [/^subscribed$/i, /^is[-_]?subscribed$/i, /^opted[-_]?in$/i, /^newsletter$/i, /^email[-_]?opt[-_]?in$/i],
  created_at: [/^created[-_]?at$/i, /^created$/i, /^created[-_]?date$/i, /^signup[-_]?date$/i, /^registered[-_]?at$/i, /^date[-_]?created$/i],
};

export function autoMapFields(columns: string[]): AutoMapFieldsResult {
  const mapping: AutoMapResult = {
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    subscribed: '',
    created_at: '',
  };
  const matched: string[] = [];
  const unmatched: string[] = [];

  // Try to match each column to a field
  columns.forEach((column) => {
    let wasMatched = false;

    for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
      // Skip if this field is already mapped
      if (mapping[field as keyof AutoMapResult]) continue;

      for (const pattern of patterns) {
        if (pattern.test(column)) {
          mapping[field as keyof AutoMapResult] = column;
          matched.push(field);
          wasMatched = true;
          break;
        }
      }
      if (wasMatched) break;
    }

    if (!wasMatched) {
      unmatched.push(column);
    }
  });

  return { mapping, matched, unmatched };
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
      // Provide a more descriptive error message
      let errorMessage = `${connection.name}: ${error.message}`;

      // Check for common error patterns and add helpful hints
      if (error.message.includes('does not exist')) {
        errorMessage += ' - check your field mapping or table name';
      } else if (error.message.includes('permission denied') || error.message.includes('not authorized')) {
        errorMessage += ' - check your API key permissions';
      } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
        errorMessage += ' - table not found, verify the table name';
      }

      console.error(`Error fetching from spoke ${connection.name}:`, error.message);
      throw new Error(errorMessage);
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
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Error fetching from spoke ${connection.name}:`, errorMessage);

    // Re-throw with spoke name context if not already included
    if (errorMessage.startsWith(connection.name)) {
      throw err;
    }
    throw new Error(`${connection.name}: ${errorMessage}`);
  }
}

export interface FetchAllSpokesResult {
  profiles: NormalizedSpokeProfile[];
  errors: string[];
}

export async function fetchAllSpokesProfiles(
  connections: SpokeConnection[]
): Promise<FetchAllSpokesResult> {
  // Filter to only active connections
  const activeConnections = connections.filter((c) => c.status === 'active');

  // Fetch from all spokes in parallel, using allSettled to handle partial failures
  const results = await Promise.allSettled(
    activeConnections.map((connection) => fetchSpokeProfiles(connection))
  );

  const profiles: NormalizedSpokeProfile[] = [];
  const errors: string[] = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      profiles.push(...result.value);
    } else {
      errors.push(result.reason?.message || 'Unknown error');
    }
  });

  return { profiles, errors };
}
