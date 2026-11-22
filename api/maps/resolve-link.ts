import net from 'node:net';

const allowedHosts = new Set([
  'maps.app.goo.gl', 'goo.gl', 'g.co', 'maps.google.com', 'www.google.com',
  'google.com', 'maps.google.com.br', 'www.google.com.br', 'google.com.br',
]);

function allowedUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol) || !allowedHosts.has(host) || net.isIP(host)) return null;
    return url;
  } catch {return null;}
}

function coords(value: string): {lat: number; lng: number} | null {
  const normalized = value.replace(/%2c/ig, ',');
  const patterns = [
    /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/i,
    /@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /(?:[?&](?:q|ll|query|destination|center|sll)=)(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
      return {lat, lng};
    }
  }
  return null;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return Response.json({error: 'Método não permitido.'}, {status: 405});
    let input: unknown;
    try {input = (await request.json() as {url?: unknown}).url;} catch {return Response.json({error: 'Link inválido.'}, {status: 400});}
    if (typeof input !== 'string' || input.length > 2048) return Response.json({error: 'Link inválido.'}, {status: 400});
    let current = allowedUrl(input.trim());
    if (!current) return Response.json({error: 'Use um link do Google Maps.'}, {status: 400});

    for (let hop = 0; hop < 6; hop++) {
      const direct = coords(current.toString());
      if (direct) return Response.json({resolvedUrl: current.toString(), coordinates: direct});
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(current, {redirect: 'manual', signal: controller.signal,
          headers: {Accept: 'text/html,application/xhtml+xml'}});
      } catch {
        return Response.json({error: 'Não foi possível abrir o link do Google Maps.'}, {status: 400});
      } finally {clearTimeout(timer);}
      const location = response.headers.get('location');
      if (location && response.status >= 300 && response.status < 400) {
        const next = new URL(location, current);
        const found = coords(next.toString());
        if (found) return Response.json({resolvedUrl: next.toString(), coordinates: found});
        current = allowedUrl(next.toString());
        if (!current) break;
        continue;
      }
      const html = (await response.text()).slice(0, 150000);
      const found = coords(html);
      if (found) return Response.json({resolvedUrl: current.toString(), coordinates: found});
      break;
    }
    return Response.json({resolvedUrl: current?.toString() || input, coordinates: null});
  },
};
