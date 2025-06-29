export default new class {
    constructor() {
        this.url = 'https://sukebei.nyaa.si';
        this.name = 'Sukebei';
    }

    /**
     * @param {string} html
     * @returns {import('./').TorrentResult[]}
     */
    parseResults(html) {
        const results = [];
        const torrentRows = html.match(/<tr class="(?:default|success|danger)"[\s\S]*?<\/tr>/g) || [];

        for (const row of torrentRows) {
            try {
                const titleMatch = row.match(/title="([^"]+)"/);
                if (!titleMatch) continue;
                const title = titleMatch[1];

                const linkMatch = row.match(/href="([^"]*\.torrent[^"]*)"/);
                if (!linkMatch) continue;
                const link = linkMatch[1].startsWith('http') ? linkMatch[1] : `${this.url}${linkMatch[1]}`;

                const magnetMatch = row.match(/href="(magnet:[^"]+)"/);
                const finalLink = magnetMatch ? magnetMatch[1] : link;

                // Hash aus Magnet-Link extrahieren
                let hash = '';
                if (magnetMatch) {
                    const hashMatch = magnetMatch[1].match(/btih:([a-fA-F0-9]{40})/);
                    hash = hashMatch ? hashMatch[1].toLowerCase() : '';
                }

                // Angepasste Regex für Sukebei-Struktur
                const statsMatch = row.match(/<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>/);
                const seeders = statsMatch ? parseInt(statsMatch[1]) : 0;
                const leechers = statsMatch ? parseInt(statsMatch[2]) : 0;
                const downloads = statsMatch ? parseInt(statsMatch[3]) : 0;

                const sizeMatch = row.match(/(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB|TiB)/);
                let size = 0;
                if (sizeMatch) {
                    const sizeValue = parseFloat(sizeMatch[1]);
                    const unit = sizeMatch[2];
                    const multipliers = { KiB: 1024, MiB: 1024**2, GiB: 1024**3, TiB: 1024**4 };
                    size = Math.round(sizeValue * (multipliers[unit] || 1));
                }

                const verified = row.includes('class="success"');
                const dateMatch = row.match(/data-timestamp="(\d+)"/);
                const date = dateMatch ? new Date(parseInt(dateMatch[1]) * 1000) : new Date();

                // Hash-Fallback falls kein Magnet-Link vorhanden
                if (!hash && finalLink) {
                    hash = this.generateHash(finalLink);
                }

                if (hash && finalLink) {
                    results.push({
                        title,
                        link: finalLink,
                        hash,
                        seeders: seeders >= 30000 ? 0 : seeders,
                        leechers: leechers >= 30000 ? 0 : leechers,
                        downloads,
                        size,
                        accuracy: verified ? 'high' : 'medium',
                        date
                    });
                }
            } catch (error) {
                continue;
            }
        }

        return results;
    }

    /** @type {import('./').SearchFunction} */
    async single({ titles, episode, resolution, exclusions = [] }) {
        if (!titles?.length) throw new Error('No titles provided');
        
        const results = [];
        
        for (const title of titles) {
            let searchQuery = title;
            if (episode) {
                searchQuery += ` ${episode.toString().padStart(2, '0')}`;
            }
            
            // Sukebei verwendet c=0_0 für alle Kategorien
            let searchUrl = `${this.url}/?f=0&c=0_0&s=seeders&o=desc&q=${encodeURIComponent(searchQuery)}`;
            
            if (resolution && resolution !== '') {
                searchUrl += `+${resolution}p`;
            }
            
            try {
                const res = await fetch(searchUrl);
                if (!res.ok) continue;
                
                const html = await res.text();
                const parsed = this.parseResults(html);
                results.push(...parsed);
            } catch (error) {
                continue;
            }
        }
        
        return this.filterResults(results);
    }

    /** @type {import('./').SearchFunction} */
    async batch({ titles, resolution, exclusions = [] }) {
        if (!titles?.length) throw new Error('No titles provided');
        
        const results = [];
        
        for (const title of titles) {
            const searchQuery = `${title} batch`;
            let searchUrl = `${this.url}/?f=0&c=0_0&s=seeders&o=desc&q=${encodeURIComponent(searchQuery)}`;
            
            if (resolution && resolution !== '') {
                searchUrl += `+${resolution}p`;
            }
            
            try {
                const res = await fetch(searchUrl);
                if (!res.ok) continue;
                
                const html = await res.text();
                const parsed = this.parseResults(html);
                results.push(...parsed.map(result => ({ ...result, type: 'batch' })));
            } catch (error) {
                continue;
            }
        }
        
        return this.filterResults(results);
    }

    // Movie verwendet die gleiche Logik wie single
    movie = this.single;

    filterResults(results) {
        // Nach Seedern sortieren
        results.sort((a, b) => b.seeders - a.seeders);
        
        // Bestes Ergebnis markieren
        if (results.length > 0) {
            results[0].type = 'best';
        }
        
        // Duplikate entfernen basierend auf Hash
        const uniqueResults = [];
        const seenHashes = new Set();
        
        for (const result of results) {
            if (!seenHashes.has(result.hash)) {
                seenHashes.add(result.hash);
                uniqueResults.push(result);
            }
        }
        
        return uniqueResults.slice(0, 20);
    }

    generateHash(link) {
        let hash = 0;
        for (let i = 0; i < link.length; i++) {
            const char = link.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(40, '0').substring(0, 40);
    }

    async test() {
        try {
            const res = await fetch(this.url);
            return res.ok;
        } catch {
            return false;
        }
    }
}();
