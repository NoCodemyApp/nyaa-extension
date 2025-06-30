/* Sukebei-Nyaa Extension – Fix für CORS + “Any”-Auflösung */
const CORS = 'https://cors.isomorphic-git.org/';   // endet mit «/»

export default new class {
  url  = 'https://sukebei.nyaa.si';
  name = 'Sukebei';

  /* zentraler Netz-Abruf über Proxy */
  async fetchRaw (target) {
    // Richtige Proxy-Syntax:  https://cors.…/https://ziel.tld/…
    const res = await fetch(CORS + target);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  /* eine Suchseite laden – Auflösung nur, wenn numerisch */
  async loadSearch (query, resolution = '') {
    const resTag = /^\d+$/.test(resolution) ? ` ${resolution}p` : '';
    const url    = `${this.url}/?f=0&c=0_0&s=seeders&o=desc&q=` +
                   encodeURIComponent(query + resTag);
    try   { return await this.fetchRaw(url); }
    catch { return ''; }                         // leer = keine Treffer
  }

  /* … parseResults(), generateHash(), filterResults() bleiben unverändert … */

  async _search ({ titles, episode, resolution, exclusions = [], batch = false }) {
    if (!titles?.length) throw new Error('No titles provided');
    const out = [];

    for (let t of titles) {
      if (!batch && episode) t += ` ${String(episode).padStart(2,'0')}`;
      if (batch) t += ' batch';

      // 1️⃣ mit Auflösung
      let html = await this.loadSearch(t, resolution);
      let res  = this.parseResults(html, exclusions);

      // 2️⃣ ohne Auflösung, falls leer
      if (res.length === 0 && /^\d+$/.test(resolution)) {
        html = await this.loadSearch(t, '');
        res  = this.parseResults(html, exclusions);
      }

      // 3️⃣ stark gekürzt
      if (res.length === 0) {
        const short = t.split(/[:(\[]/)[0].trim();
        if (short && short !== t) {
          html = await this.loadSearch(short, '');
          res  = this.parseResults(html, exclusions);
        }
      }

      if (batch) res = res.map(r => ({ ...r, type: 'batch' }));
      out.push(...res);
    }
    return this.filterResults(out);
  }

  async single (p) { return this._search({ ...p, batch:false }); }
  async batch  (p) { return this._search({ ...p, batch:true  }); }
  movie = this.single;

  /* test() bleibt wie zuvor */
}();
