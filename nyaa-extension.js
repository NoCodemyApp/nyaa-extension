// Hayase Extension für Nyaa.si
export default class NyaaExtension {
    constructor() {
        this.baseUrl = 'https://nyaa.si';
    }

    // Einzelne Episode suchen
   async single(options) {
    try {
        const { titles, episode, resolution, exclusions } = options || {};
        const results = [];

        // Sichere Behandlung von titles
        let titleArray = [];
        if (Array.isArray(titles)) {
            titleArray = titles;
        } else if (typeof titles === 'string') {
            titleArray = [titles];
        } else if (titles) {
            titleArray = [String(titles)];
        }

        for (const title of titleArray) {
            let searchQuery = String(title);
            if (episode) {
                searchQuery += ` ${String(episode).padStart(2, '0')}`;
            }

            const searchResults = await this.searchTorrents(searchQuery, resolution || '', exclusions || []);
            
            // Sichere Array-Behandlung
            if (Array.isArray(searchResults)) {
                results.push(...searchResults);
            }
        }

        return this.filterAndSortResults(results, 'single');
    } catch (error) {
        console.error('Fehler in single():', error);
        return [];
    }
}

async batch(options) {
    try {
        const { titles, resolution, exclusions } = options || {};
        const results = [];

        let titleArray = [];
        if (Array.isArray(titles)) {
            titleArray = titles;
        } else if (typeof titles === 'string') {
            titleArray = [titles];
        } else if (titles) {
            titleArray = [String(titles)];
        }

        for (const title of titleArray) {
            const searchQuery = `${String(title)} batch`;
            const searchResults = await this.searchTorrents(searchQuery, resolution || '', exclusions || []);
            
            if (Array.isArray(searchResults)) {
                const batchResults = searchResults.map(result => ({ ...result, type: 'batch' }));
                results.push(...batchResults);
            }
        }

        return this.filterAndSortResults(results, 'batch');
    } catch (error) {
        console.error('Fehler in batch():', error);
        return [];
    }
}

async movie(options) {
    try {
        const { titles, resolution, exclusions } = options || {};
        const results = [];

        let titleArray = [];
        if (Array.isArray(titles)) {
            titleArray = titles;
        } else if (typeof titles === 'string') {
            titleArray = [titles];
        } else if (titles) {
            titleArray = [String(titles)];
        }

        for (const title of titleArray) {
            const searchResults = await this.searchTorrents(String(title), resolution || '', exclusions || []);
            
            if (Array.isArray(searchResults)) {
                const movieResults = searchResults.map(result => ({ ...result, type: 'movie' }));
                results.push(...movieResults);
            }
        }

        return this.filterAndSortResults(results, 'movie');
    } catch (error) {
        console.error('Fehler in movie():', error);
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
