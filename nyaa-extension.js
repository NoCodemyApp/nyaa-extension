// Hayase Extension für Nyaa.si
export default class NyaaExtension {
    constructor() {
        this.baseUrl = 'https://nyaa.si';
    }

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

    async searchTorrents(query, resolution, exclusions) {
    try {
        let searchUrl = `${this.baseUrl}/?f=0&c=1_0&s=seeders&o=desc&q=${encodeURIComponent(String(query))}`;
        
        if (resolution && resolution !== '') {
            searchUrl += `+${resolution}p`;
        }

        const response = await fetch(searchUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        return this.parseTorrentResults(html, exclusions || []);
    } catch (error) {
        console.error('Fehler beim Suchen auf Nyaa:', error);
        return []; // Immer Array zurückgeben
    }
}

