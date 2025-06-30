/*  Sukebei-Nyaa Extension for Hayase
    – überarbeitet 2025-03-10
       • tolerantere Suche  (Fallback ohne 1080 p / bereinigte Queries)
       • Magnet-OR-Torrent  (funktioniert auch, wenn nur Magnet vorhanden)
       • stabilere Statistik-Erkennung
       • Exclusions-Filter
*/

export default new class {
    constructor () {
        this.url  = 'https://sukebei.nyaa.si';
        this.name = 'Sukebei';
    }

    /* ------------------------------------------------------------- *
     *  HTML → TorrentResult[ ]
     * ------------------------------------------------------------- */
    parseResults (html, exclusions = []) {
        const results = [];
        const rows = html.match(/<tr class="(?:default|success|danger)"[\s\S]*?<\/tr>/g) ?? [];

        for (const row of rows) {
            try {
                /* -------- Titel ------------------------------------ */
                const title = (row.match(/title="([^"]+)"/) ?? [])[1];
                if (!title) continue;

                /* Exclusions aus Hayase (z. B. Dub, Cam …)            */
                if (exclusions.some(ex =>
                        title.toLowerCase().includes(ex.toLowerCase()))) continue;

                /* -------- Links & Hash ----------------------------- */
                const magnet = (row.match(/href="(magnet:[^"]+)"/) ?? [])[1];
                const torrentRel = (row.match(/href="([^"]+\.torrent)"/) ?? [])[1];

                if (!magnet && !torrentRel) continue;   // gar nichts klickbares

                const torrent = torrentRel
                    ? (torrentRel.startsWith('http')
                        ? torrentRel
                        : `${this.url}${torrentRel}`)
                    : null;

                const link = magnet ?? torrent;
                let hash   = '';

                if (magnet) {
                    const m = magnet.match(/btih:([a-fA-F0-9]{40})/);
                    hash = m ? m[1].toLowerCase() : '';
                }
                if (!hash) hash = this.generateHash(link);   // Fallback

                /* -------- Zahlen (Seeder / Leecher / DL) ----------- */
                const nums = [...row.matchAll(/<td[^>]*>(\d+)<\/td>/g)]
                               .map(m => parseInt(m[1]));
                const len  = nums.length;
                const seeders   = len >= 3 ? nums[len - 3] : 0;
                const leechers  = len >= 2 ? nums[len - 2] : 0;
                const downloads = len >= 1 ? nums[len - 1] : 0;

                /* -------- Größe ------------------------------------ */
                const s = row.match(/(\d+(?:\.\d+)?)\s*(KiB|MiB|GiB|TiB)/);
                const multipliers = {
                    KiB: 1024,
                    MiB: 1024 ** 2,
                    GiB: 1024 ** 3,
                    TiB: 1024 ** 4,
                };
                const size = s ? Math.round(parseFloat(s[1]) *
                                (multipliers[s[2]] ?? 1)) : 0;

                /* -------- Datum & Uploader-Verifikation ------------ */
                const date = (row.match(/data-timestamp="(\d+)"/) ?? [])[1];
                const verified = /class="success"/.test(row);

                results.push({
                    title,
                    link,
                    hash,
                    seeders,
                    leechers,
                    downloads,
                    size,
                    date: date ? new Date(+date * 1000) : new Date(),
                    accuracy: verified ? 'high' : 'medium'
                });
            } catch { /* Zeile überspringen */ }
        }
        return results;
    }

    /* ------------------------------------------------------------- *
     *  Eine Suchseite abrufen  (mit/ohne Auflösung)
     * ------------------------------------------------------------- */
    async fetchSearch (query, resolution) {
        const q = `${query}${resolution ? ` ${resolution}p` : ''}`;
        const url = `${this.url}/?f=0&c=0_0&s=seeders&o=desc&q=${encodeURIComponent(q)}`;

        const res = await fetch(url);
        if (!res.ok) return '';
        return res.text();
    }

    /* ------------------------------------------------------------- *
     *  Haupt-Suchroutine  (single / batch / movie)
     * ------------------------------------------------------------- */
    async _search ({ titles, episode, resolution, exclusions = [], batch = false }) {
        if (!titles?.length) throw new Error('No titles provided');
        const results = [];

        for (let title of titles) {
            /* Episodennummer anhängen ---------------------------------- */
            if (!batch && episode)
                title += ` ${episode.toString().padStart(2, '0')}`;

            /* ggf. Zusatz 'batch' anfügen ------------------------------ */
            let query = batch ? `${title} batch` : title;

            /* –– 1. Versuch  mit Auflösungs-Tag (1080 p …) –– */
            let html = await this.fetchSearch(query, resolution);
            let parsed = this.parseResults(html, exclusions);

            /* –– 2. Fallback  ohne Auflösung, wenn leer –– */
            if (parsed.length === 0 && resolution) {
                html   = await this.fetchSearch(query, '');
                parsed = this.parseResults(html, exclusions);
            }

            /* –– 3. Fallback  mit „gekürztem“ Namen –– */
            if (parsed.length === 0) {
                const shortQuery = query.split(/[:(\[]/)[0].trim();
                if (shortQuery && shortQuery !== query) {
                    html   = await this.fetchSearch(shortQuery, '');
                    parsed = this.parseResults(html, exclusions);
                }
            }

            /* Batch-Markierung ----------------------------------------- */
            if (batch) parsed = parsed.map(r => ({ ...r, type: 'batch' }));

            results.push(...parsed);
        }
        return this.filterResults(results);
    }

    /* Hayase-API hooks --------------------------------------------- */
    async single (p) { return this._search({ ...p, batch:false }); }
    async batch  (p) { return this._search({ ...p, batch:true  }); }
    movie = this.single;

    /* ------------------------------------------------------------- *
     *  Resultate sortieren, Duplikate entfernen, Top-Resultat markieren
     * ------------------------------------------------------------- */
    filterResults (arr) {
        arr.sort((a, b) => b.seeders - a.seeders);

        if (arr.length) arr[0].type = 'best';

        const seen = new Set();
        const uniq = [];
        for (const r of arr) {
            if (!seen.has(r.hash)) {
                seen.add(r.hash);
                uniq.push(r);
            }
        }
        return uniq.slice(0, 20);
    }

    /* very simple non-crypto hash fallback ------------------------- */
    generateHash (str) {
        let h = 0;
        for (let i = 0; i < str.length; i++)
            h = (h << 5) - h + str.charCodeAt(i) & 0xFFFFFFFF;
        return Math.abs(h).toString(16).padStart(40, '0').slice(0, 40);
    }

    /* Schnelltest für Hayase-“Test Extension”-Knopf ---------------- */
    async test () {
        try { const r = await fetch(this.url); return r.ok; }
        catch { return false; }
    }
}();

