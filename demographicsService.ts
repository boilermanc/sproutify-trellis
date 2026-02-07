import { supabase as hubClient } from './lib/supabase';

// Types
export type PredictedGender = 'male' | 'female' | 'unknown';
export type GenderConfidence = 'high' | 'medium' | 'low';

export interface GenderPrediction {
  gender: PredictedGender;
  confidence: GenderConfidence;
  method: 'database_lookup' | 'heuristic' | 'unknown';
  origin?: string;
}

export type PredictedAgeRange = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+' | 'unknown';
export type AgeConfidence = 'high' | 'medium' | 'low';

export interface AgePrediction {
  age_range: PredictedAgeRange;
  confidence: AgeConfidence;
  method: 'behavior_analysis' | 'unknown';
}

export interface PredictedDemographics {
  gender: GenderPrediction;
  age: AgePrediction;
}

interface NameGenderRecord {
  name: string;
  gender: 'male' | 'female' | 'neutral';
  origin: string;
  confidence: 'high' | 'medium' | 'low';
}

// Cache for name lookups
let nameCache: Map<string, NameGenderRecord> | null = null;
let cacheLoadPromise: Promise<void> | null = null;

const getHubClient = () => hubClient;

/**
 * Load all names from Supabase into cache
 */
export const loadNameCache = async (): Promise<void> => {
  // If already loading, wait for that to complete
  if (cacheLoadPromise) {
    return cacheLoadPromise;
  }

  // If already loaded, return immediately
  if (nameCache) {
    return;
  }

  cacheLoadPromise = (async () => {
    const client = getHubClient();
    if (!client) {
      console.warn('No Supabase client available for demographics service');
      nameCache = new Map();
      return;
    }

    try {
      const { data, error } = await client
        .from('name_gender_map')
        .select('name, gender, origin, confidence');

      if (error) {
        console.error('Failed to load name cache:', error);
        nameCache = new Map();
        return;
      }

      nameCache = new Map();
      (data || []).forEach((record: NameGenderRecord) => {
        nameCache!.set(record.name.toLowerCase(), record);
      });

      console.log(`Demographics: Loaded ${nameCache.size} names from database`);
    } catch (err) {
      console.error('Failed to load name cache:', err);
      nameCache = new Map();
    }
  })();

  return cacheLoadPromise;
};

/**
 * Clear the name cache (useful for testing or refresh)
 */
export const clearNameCache = () => {
  nameCache = null;
  cacheLoadPromise = null;
};

/**
 * Get stats about the loaded name cache
 */
export const getNameCacheStats = () => {
  if (!nameCache) {
    return { loaded: false, count: 0, byOrigin: {} };
  }

  const byOrigin: Record<string, number> = {};
  const byGender: Record<string, number> = { male: 0, female: 0, neutral: 0 };

  nameCache.forEach(record => {
    byOrigin[record.origin] = (byOrigin[record.origin] || 0) + 1;
    byGender[record.gender] = (byGender[record.gender] || 0) + 1;
  });

  return {
    loaded: true,
    count: nameCache.size,
    byOrigin,
    byGender,
  };
};

/**
 * Predict gender from first name using database lookup with heuristic fallback
 */
export const predictGender = async (firstName: string | undefined): Promise<GenderPrediction> => {
  if (!firstName || firstName.trim().length === 0) {
    return { gender: 'unknown', confidence: 'low', method: 'unknown' };
  }

  // Ensure cache is loaded
  await loadNameCache();

  const name = firstName.trim().toLowerCase();

  // Try database lookup first
  if (nameCache && nameCache.has(name)) {
    const record = nameCache.get(name)!;

    if (record.gender === 'neutral') {
      return {
        gender: 'unknown',
        confidence: 'low',
        method: 'database_lookup',
        origin: record.origin,
      };
    }

    return {
      gender: record.gender,
      confidence: record.confidence as GenderConfidence,
      method: 'database_lookup',
      origin: record.origin,
    };
  }

  // Fall back to heuristics for names not in database
  return predictGenderByHeuristic(name);
};

/**
 * Synchronous gender prediction (uses cached data only, no async)
 * Use this when you need immediate results and cache is already loaded
 */
export const predictGenderSync = (firstName: string | undefined): GenderPrediction => {
  if (!firstName || firstName.trim().length === 0) {
    return { gender: 'unknown', confidence: 'low', method: 'unknown' };
  }

  const name = firstName.trim().toLowerCase();

  // Try database lookup if cache is available
  if (nameCache && nameCache.has(name)) {
    const record = nameCache.get(name)!;

    if (record.gender === 'neutral') {
      return {
        gender: 'unknown',
        confidence: 'low',
        method: 'database_lookup',
        origin: record.origin,
      };
    }

    return {
      gender: record.gender,
      confidence: record.confidence as GenderConfidence,
      method: 'database_lookup',
      origin: record.origin,
    };
  }

  // Fall back to heuristics
  return predictGenderByHeuristic(name);
};

/**
 * Heuristic-based gender prediction for names not in database
 */
const predictGenderByHeuristic = (name: string): GenderPrediction => {
  // Common feminine endings
  if (name.endsWith('a') || name.endsWith('ie') || name.endsWith('ina') ||
      name.endsWith('ella') || name.endsWith('ette') || name.endsWith('een') ||
      name.endsWith('leen') || name.endsWith('lyn') || name.endsWith('ia')) {
    return { gender: 'female', confidence: 'low', method: 'heuristic' };
  }

  // Common masculine endings
  if (name.endsWith('son') || name.endsWith('ton') || name.endsWith('ard') ||
      name.endsWith('ew') || name.endsWith('old') || name.endsWith('ald') ||
      name.endsWith('ric') || name.endsWith('rick')) {
    return { gender: 'male', confidence: 'low', method: 'heuristic' };
  }

  return { gender: 'unknown', confidence: 'low', method: 'unknown' };
};

/**
 * Predict age range from purchase behavior and patterns
 */
export const predictAgeRange = (
  orderStats?: {
    ltv?: number;
    order_count?: number;
    avg_order_value?: number;
    products_purchased?: { product_name: string }[];
  },
  createdAt?: string
): AgePrediction => {
  if (!orderStats || orderStats.order_count === 0) {
    return { age_range: 'unknown', confidence: 'low', method: 'unknown' };
  }

  const { ltv = 0, order_count = 0, avg_order_value = 0 } = orderStats;

  // Simple heuristics based on purchasing patterns
  let ageScore = 0;

  // LTV indicators
  if (ltv > 500) ageScore += 2;
  else if (ltv > 200) ageScore += 1;
  else if (ltv < 50) ageScore -= 1;

  // Order frequency
  if (order_count > 10) ageScore += 2;
  else if (order_count > 5) ageScore += 1;
  else if (order_count === 1) ageScore -= 1;

  // Average order value
  if (avg_order_value > 100) ageScore += 1;
  else if (avg_order_value < 25) ageScore -= 1;

  // Customer tenure
  if (createdAt) {
    const yearsAsCustomer = (Date.now() - new Date(createdAt).getTime()) / (365 * 24 * 60 * 60 * 1000);
    if (yearsAsCustomer > 3) ageScore += 2;
    else if (yearsAsCustomer > 1) ageScore += 1;
  }

  // Map score to age range
  let age_range: PredictedAgeRange;
  let confidence: AgeConfidence = 'low';

  if (ageScore >= 5) {
    age_range = '55-64';
    confidence = 'medium';
  } else if (ageScore >= 3) {
    age_range = '45-54';
    confidence = 'medium';
  } else if (ageScore >= 1) {
    age_range = '35-44';
    confidence = 'low';
  } else if (ageScore >= -1) {
    age_range = '25-34';
    confidence = 'low';
  } else {
    age_range = '18-24';
    confidence = 'low';
  }

  return { age_range, confidence, method: 'behavior_analysis' };
};

/**
 * Get full demographics prediction for a profile (async version)
 */
export const predictDemographics = async (
  firstName?: string,
  orderStats?: {
    ltv?: number;
    order_count?: number;
    avg_order_value?: number;
    products_purchased?: { product_name: string }[];
  },
  createdAt?: string
): Promise<PredictedDemographics> => {
  return {
    gender: await predictGender(firstName),
    age: predictAgeRange(orderStats, createdAt),
  };
};

/**
 * Get full demographics prediction (sync version, requires cache preloaded)
 */
export const predictDemographicsSync = (
  firstName?: string,
  orderStats?: {
    ltv?: number;
    order_count?: number;
    avg_order_value?: number;
    products_purchased?: { product_name: string }[];
  },
  createdAt?: string
): PredictedDemographics => {
  return {
    gender: predictGenderSync(firstName),
    age: predictAgeRange(orderStats, createdAt),
  };
};

/**
 * Get gender distribution stats for a set of profiles
 * Requires cache to be preloaded with loadNameCache()
 */
export const getGenderDistribution = (
  profiles: Array<{ first_name?: string }>
): { male: number; female: number; unknown: number } => {
  const result = { male: 0, female: 0, unknown: 0 };

  profiles.forEach(profile => {
    const prediction = predictGenderSync(profile.first_name);
    result[prediction.gender]++;
  });

  return result;
};

/**
 * Get age distribution stats for a set of profiles
 */
export const getAgeDistribution = (
  profiles: Array<{
    first_name?: string;
    created_at?: string;
    order_stats?: {
      ltv?: number;
      order_count?: number;
      avg_order_value?: number;
    };
  }>
): Record<PredictedAgeRange, number> => {
  const result: Record<PredictedAgeRange, number> = {
    '18-24': 0,
    '25-34': 0,
    '35-44': 0,
    '45-54': 0,
    '55-64': 0,
    '65+': 0,
    'unknown': 0,
  };

  profiles.forEach(profile => {
    const prediction = predictAgeRange(profile.order_stats, profile.created_at);
    result[prediction.age_range]++;
  });

  return result;
};

/**
 * Get gender distribution with origin breakdown
 */
export const getGenderDistributionWithOrigins = (
  profiles: Array<{ first_name?: string }>
): {
  male: number;
  female: number;
  unknown: number;
  byOrigin: Record<string, { male: number; female: number; unknown: number }>;
} => {
  const result = {
    male: 0,
    female: 0,
    unknown: 0,
    byOrigin: {} as Record<string, { male: number; female: number; unknown: number }>,
  };

  profiles.forEach(profile => {
    const prediction = predictGenderSync(profile.first_name);
    result[prediction.gender]++;

    const origin = prediction.origin || 'unknown';
    if (!result.byOrigin[origin]) {
      result.byOrigin[origin] = { male: 0, female: 0, unknown: 0 };
    }
    result.byOrigin[origin][prediction.gender]++;
  });

  return result;
};
