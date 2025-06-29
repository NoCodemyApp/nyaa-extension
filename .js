// Hayase Extension für Nyaa.si
export default class NyaaExtension {
    constructor() {
        this.baseUrl = 'https://nyaa.si';
    }

    // Einzelne Episode suchen
    async single(options) {
        const { titles = [], episode, resolution = '', exclusions = [] } = options;
        const results = [];

        // Sichere Behandlung von titles - kann String oder Array sein
        const titleArray = Array.isArray(titles) ? titles : [titles].filter(Boolean);

        for (const title of titleArray) {
            let searchQuery = `${title}`;
            if (episode) {
                searchQuery += ` ${episode.toString().padStart(2, '0')}`;
            }

            const searchResults = await this.searchTorrents(searchQuery, resolution, exclusions);
            results.push(...searchResults);
        }

        return this.filterAndSortResults(results, 'single');
    }

    // Batch-Downloads suchen
    async batch(options) {
        const { titles = [], resolution = '', exclusions = [] } = options;
        const results = [];

        const titleArray = Array.isArray(titles) ? titles : [titles].filter(Boolean);

        for (const title of titleArray) {
            const searchQuery = `${title} batch`;
            const searchResults = await this.searchTorrents(searchQuery, resolution, exclusions);
            results.push(...searchResults.map(result => ({ ...result, type: 'batch' })));
        }

        return this.filterAndSortResults(results, 'batch');
    }

    // Filme suchen
    async movie(options) {
        const { titles = [], resolution = '', exclusions = [] } = options;
        const results = [];

        const titleArray = Array.isArray(titles) ? titles : [titles].filter(Boolean);

        for (const title of titleArray) {
            const searchResults = await this.searchTorrents(title, resolution, exclusions);
            results.push(...searchResults.map(result => ({ ...result, type: 'movie' })));
        }

        return this.filterAndSortResults(results, 'movie');
    }

    // Rest der Funktionen bleibt gleich...
    async searchTorrents(query, resolution, exclusions) {
        try {
            let searchUrl = `${this.baseUrl}/?f=0&c=1_0&s=seeders&o=desc&q=${encodeURIComponent(query)}`;
            
            if (resolution && resolution !== '') {
                searchUrl += `+${resolution}p`;
            }

            const response = await fetch(searchUrl);
            const html = await response.text();

            return this.parseTorrentResults(html, exclusions);
        } catch (error) {
            console.error('Fehler beim Suchen auf Nyaa:', error);
            return [];
        }
    }

    // Sichere Behandlung von exclusions
    parseTorrentResults(html, exclusions = []) {
        const results = [];
        const torrentRows = html.match(/<tr class="(?:default|success|danger)"[\s\S]*?<\/tr>/g) || [];

        for (const row of torrentRows) {
            try {
                const titleMatch = row.match(/title="([^"]+)"/);
                if (!titleMatch) continue;
                const title = titleMatch[1];

                // Sichere Behandlung von exclusions
                const exclusionArray = Array.isArray(exclusions) ? exclusions : [];
                if (exclusionArray.some(exclusion => 
                    title.toLowerCase().includes(exclusion.toLowerCase())
                )) {
                    continue;
                }

                // Rest des Parsing-Codes...
                const linkMatch = row.match(/href="([^"]*\.torrent[^"]*)"/);
                if (!linkMatch) continue;
                const link = linkMatch[1].startsWith('http') ? linkMatch[1] : `${this.baseUrl}${linkMatch[1]}`;

                const magnetMatch = row.match(/href="(magnet:[^"]+)"/);
                const finalLink = magnetMatch ? magnetMatch[1] : link;

                const seedersMatch = row.match(/<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d+)<\/td>/);
                const seeders = seedersMatch ? parseInt(seedersMatch[1]) : 0;
                const leechers = seedersMatch ? parseInt(seedersMatch[2]) : 0;

                const downloadsMatch = row.match(/<td[^>]*>(\d+)<\/td>(?:\s*<td[^>]*>\d+<\/td>){2}/);
                const downloads = downloadsMatch ? parseInt(downloadsMatch[1]) : 0;

                const sizeMatch = row.match(/(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB|TiB)/);
                let size = 0;
                if (sizeMatch) {
                    const sizeValue = parseFloat(sizeMatch[1]);
                    const unit = sizeMatch[2];
                    const multipliers = { KiB: 1024, MiB: 1024**2, GiB: 1024**3, TiB: 1024**4 };
                    size = Math.round(sizeValue * (multipliers[unit] || 1));
                }

                let hash = '';
                if (magnetMatch) {
                    const hashMatch = magnetMatch[1].match(/btih:([a-fA-F0-9]{40})/);
                    hash = hashMatch ? hashMatch[1].toLowerCase() : '';
                }

                const verified = row.includes('class="success"');
                const dateMatch = row.match(/data-timestamp="(\d+)"/);
                const date = dateMatch ? new Date(parseInt(dateMatch[1]) * 1000) : new Date();

                if (hash || finalLink) {
                    results.push({
                        title,
                        link: finalLink,
                        hash: hash || this.generateHashFromLink(finalLink),
                        seeders,
                        leechers,
                        downloads,
                        size,
                        verified,
                        date
                    });
                }
            } catch (error) {
                console.error('Fehler beim Parsen einer Torrent-Zeile:', error);
                continue;
            }
        }

        return results;
    }

    filterAndSortResults(results, type) {
        results.sort((a, b) => b.seeders - a.seeders);

        if (results.length > 0) {
            results[0].type = 'best';
        }

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

    generateHashFromLink(link) {
        let hash = 0;
        for (let i = 0; i < link.length; i++) {
            const char = link.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0').repeat(5).substring(0, 40);
    }
}
