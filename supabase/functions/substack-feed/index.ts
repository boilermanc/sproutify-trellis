// Trellis: allowlisted public Substack RSS reader.
// Returns public article metadata only; no subscriber or private analytics data.

const ALLOWED_PUBLICATIONS = new Set([
  'https://sweetwatertechnology.substack.com',
]);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}

function decodeXml(value: string) {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function readTag(xml: string, tag: string) {
  const escaped = tag.replace(':', '\\:');
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function stripHtml(value: string) {
  return decodeXml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const publicationUrl = String(body?.publication_url || '').replace(/\/$/, '');
    const limit = Math.min(20, Math.max(1, Number(body?.limit) || 8));
    if (!ALLOWED_PUBLICATIONS.has(publicationUrl)) return json({ error: 'Publication is not allowlisted' }, 400);

    const feedUrl = `${publicationUrl}/feed`;
    const response = await fetch(feedUrl, {
      headers: { Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' },
    });
    if (!response.ok) return json({ error: `Substack returned HTTP ${response.status}` }, 502);

    const xml = await response.text();
    const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, limit);
    const articles = items.map((match, index) => {
      const item = match[1];
      const url = readTag(item, 'link');
      const categories = [...item.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)].map(category => decodeXml(category[1]));
      return {
        id: readTag(item, 'guid') || url || `substack-${index}`,
        title: readTag(item, 'title') || 'Untitled article',
        url,
        publishedAt: readTag(item, 'pubDate') || null,
        description: stripHtml(readTag(item, 'description')).slice(0, 500),
        categories,
      };
    }).filter(article => article.url.startsWith(`${publicationUrl}/p/`));

    return json({ publication_url: publicationUrl, feed_url: feedUrl, articles, fetched_at: new Date().toISOString() });
  } catch (caught) {
    return json({ error: caught instanceof Error ? caught.message : 'Could not read the Substack feed' }, 500);
  }
});
