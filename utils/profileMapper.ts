
import { Profile, NormalizedSpokeProfile } from '../types';

/**
 * Consent source values — must match labels in utils.ts getConsentLabel().
 *  - spoke_native:    Spoke DB had an explicit subscribed/opt-in column
 *  - import_explicit: CSV / manual import where consent was explicitly confirmed
 *  - import_default:  No consent data found — assumed subscribed (needs verification)
 *  - mock:            Test / demo data
 */
export type ConsentSource = 'spoke_native' | 'import_explicit' | 'import_default' | 'mock';

/**
 * Determines the consent_source tag for a profile based on available data.
 *  - If the spoke DB contained an explicit subscribed field → 'spoke_native'
 *  - If the record came from a CSV import with an opt-in column  → 'import_explicit'
 *  - If no consent info was present → 'import_default'
 */
export const getConsentSource = (
  subscribedField: boolean | undefined | null,
  origin?: 'spoke' | 'csv' | 'mock',
): ConsentSource => {
  if (origin === 'mock') return 'mock';
  if (subscribedField !== undefined && subscribedField !== null) {
    return origin === 'csv' ? 'import_explicit' : 'spoke_native';
  }
  return 'import_default';
};

/**
 * Maps raw spoke customer consent fields to Profile consent values.
 * Handles WooCommerce-style opt-in fields (email_optin, sms_optin, newsletter_optin)
 * and preserves marketing_pause if present.
 */
export const mapSpokeConsent = (spokeCustomer: any): { is_subscribed: boolean; marketing_pause: boolean } => {
  // Check all known opt-in field variants
  const optInField = spokeCustomer.email_optin
    ?? spokeCustomer.sms_optin
    ?? spokeCustomer.newsletter_optin
    ?? spokeCustomer.subscribed;

  // If ANY opt-in field is explicitly false, respect it
  if (optInField === false) {
    return { is_subscribed: false, marketing_pause: false };
  }
  if (spokeCustomer.marketing_pause === true) {
    return { is_subscribed: true, marketing_pause: true };
  }
  // If consent fields are missing entirely (null/undefined), flag as unknown
  // by setting is_subscribed to true but tracking via consent_source metadata
  const hasConsentData = optInField !== undefined && optInField !== null;
  return {
    is_subscribed: hasConsentData ? Boolean(optInField) : true,
    marketing_pause: false,
  };
};

/**
 * Maps a NormalizedSpokeProfile (from federated pipeline) to consent fields + consent_source.
 * Used by App.tsx when converting EnrichedProfile → Profile.
 */
export const mapFederatedConsent = (
  profile: NormalizedSpokeProfile,
): { is_subscribed: boolean; marketing_pause: boolean; consent_source: ConsentSource } => {
  const is_subscribed = profile.subscribed ?? true;
  const marketing_pause = (profile as any).marketing_pause === true;
  const consent_source = getConsentSource(profile.subscribed, 'spoke');
  return { is_subscribed, marketing_pause, consent_source };
};

/**
 * Maps a raw spoke customer record to a full Trellis Profile.
 * Used by spoke connectors and CSV importers for initial ingestion.
 */
export const mapSpokeToProfile = (spokeCustomer: any, spokeName: string, origin: 'spoke' | 'csv' = 'spoke'): Profile => {
  const consent = mapSpokeConsent(spokeCustomer);
  const optInField = spokeCustomer.email_optin ?? spokeCustomer.subscribed;
  const consent_source = getConsentSource(optInField, origin);

  return {
    id: spokeCustomer.id || `p_${crypto.randomUUID()}`,
    spoke_uuid: spokeCustomer.woo_customer_id?.toString() || spokeCustomer.id,
    email: spokeCustomer.email?.toLowerCase().trim(),
    first_name: spokeCustomer.first_name || 'Unknown',
    phone: spokeCustomer.phone || undefined,
    ...consent,
    tags: [],
    segments: [],
    branches: [spokeName],
    status: 'active',
    ltv: parseFloat(spokeCustomer.ltv) || 0,
    churn_risk: 'minimal',
    last_active: spokeCustomer.updated_at || spokeCustomer.last_order_date || new Date().toISOString(),
    last_event_timestamp: spokeCustomer.updated_at || undefined,
    engagement_score: spokeCustomer.order_count ? Math.min(spokeCustomer.order_count * 10, 100) : 0,
    metadata: {
      consent_source,
      spoke_origin: spokeName,
    },
  };
};
