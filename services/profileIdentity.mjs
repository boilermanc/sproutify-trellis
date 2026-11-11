export function profileText(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && !['null', 'undefined'].includes(text.toLowerCase()) ? text : undefined;
}

export function profileDisplayName(profile) {
  return [profileText(profile.first_name), profileText(profile.last_name)].filter(Boolean).join(' ') ||
    profileText(profile.email) || 'Unnamed profile';
}
