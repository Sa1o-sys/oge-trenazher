// Универсальный загрузчик ассетов, пытается несколько вариантов пути
export async function fetchAsset(rel) {
  const base = document.baseURI;
  const origin = window.location.origin;
  const candidates = [];

  try { candidates.push(new URL('./' + rel, base).href); } catch (e) {}
  try { candidates.push(new URL(rel, base).href); } catch (e) {}
  try { candidates.push(new URL('/' + rel, origin).href); } catch (e) {}
  try { candidates.push(new URL('./public/' + rel, base).href); } catch (e) {}
  try { candidates.push(new URL('public/' + rel, base).href); } catch (e) {}
  try { candidates.push(new URL('/public/' + rel, origin).href); } catch (e) {}

  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (r && r.ok) return r;
    } catch (err) {
      // ignore
    }
  }
  throw new Error('Asset not found: ' + rel);
}

export default fetchAsset;
