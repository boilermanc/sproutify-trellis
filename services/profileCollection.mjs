export function hasKnownCollectionCount(profile) {
  return Number.isSafeInteger(profile.collection_record_count) && profile.collection_record_count >= 0;
}

export function matchesCollectionFilter(profile, filter) {
  if (filter === 'all') return true;
  const known = hasKnownCollectionCount(profile);
  if (filter === 'unknown') return !known;
  if (!known) return false;
  if (filter === 'empty') return profile.collection_record_count === 0;
  if (filter === 'has_records') return profile.collection_record_count > 0;
  return false;
}
