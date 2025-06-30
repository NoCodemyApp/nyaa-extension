/*  Sukebei-Nyaa Extension für Hayase */
const PRIMARY_PROXY  = 'https://api.allorigins.win/raw?url=';
const FALLBACK_PROXY = 'https://cors.isomorphic-git.org/';

export default new class {

  constructor () {
    this.url  = 'https://sukebei.nyaa.si';
    this.name = 'Sukebei';
  }

  /* ---------- Netzabruf mit Proxy + Fallback -------------------- */
  async fetchRaw (target) {
    const tryProxy = async (base) => {
      const res = await fetch(base + encodeURIComponent(target));
      if (res.ok) return res.text();
      throw new Error();
    };
    try       { return await tryProxy(PRIMARY_PROXY);  }
    catch (_) { return await tryProxy(FALLBACK_PROXY); }
  }

  /* ---------- Suchseite laden ---------------------------------- */
  async loadSearch (query, res = '') {
    const tag = /^\d+$/.test(res) ? ` ${res}p` : '';
    const url = `${this.url}/?f=0&c=2_2&s=seeders&o=desc&q=` +
                encodeURIComponent(query + tag);
    try { return await this.fetchRaw(url); }
    catch { return ''; }
  }

/* ---------- HTML → Ergebnisse -------------------------------- */
parseResults (html, exclusions = []) {
  const out  = [];
  const rows = html.match(/<tr class="(?:default|success|danger)"[\s\S]*?<\/tr>/g) || [];

  for (const row of rows) {
    try {
      /* ---------- Trusted / Remake / Default ----------------- */
      const cls = (row.match(/<tr\s+class="([^"]+)"/i) || [])[1] || 'default';
      let status   = 'default';   // weiss
      let accuracy = 'medium';
      let priority = 2;           // ganz unten

      if (cls === 'success') {      // grün
        status   = 'trusted';
        accuracy = 'high';
        priority = 0;
      } else if (cls === 'danger') { // rot
        status   = 'remake';
        accuracy = 'low';
        priority = 1;
      }

      /* ---------- Titel -------------------------------------- */
      const mTitle = row.match(/title="([^"]+)"/);
      if (!mTitle) continue;
      const title = mTitle[1];

      if (exclusions.some(x => title.toLowerCase().includes(x.toLowerCase())))
        continue;

      /* ---------- Link / Hash -------------------------------- */
      const mMag = row.match(/href="(magnet:[^"]+)"/);
      const mTor = row.match(/href="([^"]+\.torrent)"/);
      const link = mMag ? mMag[1] : (mTor ? this.url + mTor[1] : '');
      if (!link) continue;

      let hash = '';
      if (mMag) {
        const h = mMag[1].match(/btih:([a-f0-9]{40})/i);
        if (h) hash = h[1].toLowerCase();
      }
      if (!hash) hash = this.generateHash(link);

      /* ---------- Zahlen ------------------------------------- */
      const nums = [];
      row.replace(/<td[^>]*>(\d+)<\/td>/g, (_, n) => { nums.push(parseInt(n,10)); return _; });
      const len       = nums.length;
      const seeders   = len >= 3 ? nums[len-3] : 0;
      const leechers  = len >= 2 ? nums[len-2] : 0;
      const downloads = len >= 1 ? nums[len-1] : 0;

      /* ---------- Größe -------------------------------------- */
      const g = row.match(/(\d+(?:\.\d+)?)\s*(KiB|MiB|GiB|TiB)/);
      const mul = {KiB:1024, MiB:1<<20, GiB:1<<30, TiB:1<<40};
      const size = g ? Math.round(parseFloat(g[1]) * (mul[g[2]]||1)) : 0;

      const ts   = row.match(/data-timestamp="(\d+)"/);
      const date = ts ? new Date(parseInt(ts[1],10)*1000) : new Date();

      out.push({
        title, link, hash,
        seeders, leechers, downloads,
        size, date,
        accuracy,
        status,
        priority
      });
    } catch { /* Zeile überspringen */ }
  }
  return out;
}


  /* ---------- gemeinsame Suche ---------------------------------- */
  async _search ({ titles, episode, resolution, exclusions = [], batch = false }) {
    const collected = [];

    for (let name of titles || []) {
      if (!batch && episode) name += ` ${(''+episode).padStart(2,'0')}`;
      if (batch) name += ' batch';

      /* 1 – mit Auflösung */
      let html = await this.loadSearch(name, resolution);
      let res  = this.parseResults(html, exclusions);

      /* 2 – ohne Auflösung */
      if (res.length === 0 && /^\d+$/.test(resolution)) {
        html = await this.loadSearch(name, '');
        res  = this.parseResults(html, exclusions);
      }

      /* 3 – gekürzt */
      if (res.length === 0) {
        const short = name.split(/[:(\[]/)[0].trim();
        if (short && short !== name) {
          html = await this.loadSearch(short, '');
          res  = this.parseResults(html, exclusions);
        }
      }

      if (batch) res = res.map(x => ({ ...x, type: 'batch' }));
      collected.push(...res);
    }
    return this.filterResults(collected);
  }

  async single (p) { return this._search({ ...p, batch:false }); }
  async batch  (p) { return this._search({ ...p, batch:true  }); }
  movie = this.single;

  /* ---------- Sortieren / Duplikate ------------------------------ */
  filterResults (arr) {
   // erst Farbe (priority), dann Seeder
    arr.sort((a,b) => (a.priority - b.priority) || (b.seeders - a.seeders));
    if (arr.length) arr[0].type = 'best';
    const seen = {}, uniq = [];
    for (const r of arr) if (!seen[r.hash]) { seen[r.hash] = 1; uniq.push(r); }
    return uniq.slice(0,20);
  }

  generateHash (str) {
    let h = 0;
    for (let i=0;i<str.length;i++)
      h = (h<<5)-h + str.charCodeAt(i) & 0xFFFFFFFF;
    return Math.abs(h).toString(16).padStart(40,'0').slice(0,40);
  }

  async test () {
    try {
      const res = await fetch(PRIMARY_PROXY + encodeURIComponent(this.url));
      return res.ok;
    } catch { return false; }
  }
}();
