const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseMap = (value, label) => {
  if (!value) return {};
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${label} must be valid JSON.`); }
  if (!record(parsed) || Object.keys(parsed).length > 100) throw new Error(`${label} must be a bounded object map.`);
  return parsed;
};

export function createCaptureSecretResolvers(environment = {}) {
  let fixtureMap;
  let authMap;
  return {
    resolveFixture: async key => {
      fixtureMap ||= parseMap(environment.PROMO_CAPTURE_FIXTURE_MAP_JSON, 'PROMO_CAPTURE_FIXTURE_MAP_JSON');
      const value = fixtureMap[key];
      if (!record(value)) return null;
      return structuredClone(value);
    },
    resolveAuthProfile: async key => {
      authMap ||= parseMap(environment.PROMO_CAPTURE_AUTH_MAP_JSON, 'PROMO_CAPTURE_AUTH_MAP_JSON');
      const value = authMap[key];
      if (!record(value)) return null;
      return structuredClone(value);
    },
  };
}
