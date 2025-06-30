/*  Sukebei-Nyaa Extension – CORS-tauglich  */
const CORS_PROXY = 'https://cors.isomorphic-git.org/';        // beliebiger Proxy der Access-Control-Header setzt

export default new class {
  constructor () {
    this.url  = 'https://sukebei.nyaa.si';
    this.name = 'Sukebei';
  }

  /* ------------ Low-level fetch mit CORS-Proxy -------------- */
  async fetchRaw (targetUrl) {
    const res = await fetch(`${CORS_PROXY}${encodeURIComponent(targetUrl)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();                 // funktioniert, weil Proxy CORS-Header liefert
  }

  /* ------------ HTML-Parser bleibt wie gehabt --------------- */
  parseResults (html, exclusions = []) {
    const results = [];
    const rows = html.match(/<tr class="(?:default|success|danger)"[\s\S]*?<\/tr>/g) ?? [];

    for (const row of rows) {
      try {
        const title = (row.match(/title="([^"]+)"/) ?? [])[1];
        if (!title) continue;
        if (exclusions.some(x => title.toLowerCase().includes(x.toLowerCase()))) continue;

        /* Magnet / Torrent ------------------------------------ */
        const magnet  = (row.match(/href="(magnet:[^"]+)"/) ?? [])[1];
        const tRel    = (row.match(/href="([^"]+\.torrent)"/) ?? [])[1];
        const torrent = tRel ? `${this.url}${tRel}` : null;
        const link    = magnet || torrent;
        if (!link) continue;

        let hash = '';                                    // Hash aus Magnet
        if (magnet) {
          const h = magnet.match(/btih:([a-f0-9]{40})/i);
          hash = h ? h[1].toLowerCase() : '';
        }
        if (!hash) hash = this.generateHash(link);        // Fallback

        /* Zahlen, Größe, Datum ------------------------------ */
        const nums      = [...row.matchAll(/<td[^>]*>(\d+)<\/td>/g)].map(m => +m[1]);
        const seeders   = nums.at(-3) ?? 0;
        const leechers  = nums.at(-2) ?? 0;
        const downloads = nums.at(-1) ?? 0;

        const s   = row.match(/(\d+(?:\.\d+)?)\s*(KiB|MiB|GiB|TiB)/);
        const mul = {KiB:1024, MiB:2**20, GiB:2**30, TiB:2**40};
        const size = s ? Math.round(parseFloat(s[1]) * (mul[s[2]]||1)) : 0;

        const ts   = (row.match(/data-timestamp="(\d+)"/) ?? [])[1];
        const date = ts ? new Date(+ts * 1000) : new Date();
        const verified = /class="success"/.test(row);

        results.push({
          title, link, hash, seeders, leechers, downloads,
          size, date, accuracy: verified ? 'high' : 'medium'
        });
      } catch {/* Zeile überspringen */}
    }
    return results;
  }

  /* ------------ Gemeinsame Suchlogik ------------------------ */
  async _search ({ titles, episode, resolution, exclusions = [], batch = false }) {
    if (!titles?.length) throw new Error('No titles provided');
    const out = [];

    for (let origTitle of titles) {
      let q = batch ? `${origTitle} batch` : origTitle;
      if (!batch && episode) q += ` ${String(episode).padStart(2,'0')}`;

      /* 1️⃣ mit Auflösung (falls gegeben) */
      let html = await this.tryFetch(q, resolution);
      let res  = this.parseResults(html, exclusions);

      /* 2️⃣ ohne Auflösung, falls leer */
      if (res.length === 0 && resolution) {
        html = await this.tryFetch(q, '');
        res  = this.parseResults(html, exclusions);
      }

      /* 3️⃣ stark gekürzt (alles vor : ( [ ) */
      if (res.length === 0) {
        const short = q.split(/[:(\[]/)[0].trim();
        if (short && short !== q) {
          html = await this.tryFetch(short, '');
          res  = this.parseResults(html, exclusions);
        }
      }

      if (batch) res = res.map(r => ({ ...r, type: 'batch' }));
      out.push(...res);
    }
    return this.filterResults(out);
  }

  /* Hilfs-Wrapper mit eigenem Error-Catch -------------------- */
  async tryFetch (query, resTag) {
    try {
      const url = `${this.url}/?f=0&c=0_0&s=seeders&o=desc&q=` +
                  encodeURIComponent(query + (resTag ? ` ${resTag}p` : ''));
      return await this.fetchRaw(url);
    } catch (_) {
      return '';                     // leer zurück = keine Treffer
    }
  }

  /* Hayase-Hooks --------------------------------------------- */
  async single (p) { return this._search({ ...p, batch:false }); }
  async batch  (p) { return this._search({ ...p, batch:true  }); }
  movie = this.single;

  /* Sortierung / Duplikate ----------------------------------- */
  filterResults (arr) {
    arr.sort((a,b) => b.seeders - a.seeders);
    if (arr.length) arr[0].type = 'best';
    const seen=new Set(), uniq=[];
    for (const r of arr) if (!seen.has(r.hash)){seen.add(r.hash);uniq.push(r);}
    return uniq.slice(0,20);
  }

  generateHash (str) {
    let h=0; for (let i=0;i<str.length;i++) h=((h<<5)-h)+str.charCodeAt(i)&0xFFFFFFFF;
    return Math.abs(h).toString(16).padStart(40,'0').slice(0,40);
  }

  async test () {
    try { return (await fetch(CORS_PROXY+encodeURIComponent(this.url))).ok; }
    catch { return false; }
  }
}();


