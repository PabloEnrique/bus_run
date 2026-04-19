/**
 * @module maps/index
 * Map registry — provides lookup and listing for all available maps.
 */
import cityMap from './city.js';
import highwayMap from './highway.js';

const MAPS = new Map([
    [cityMap.id, cityMap],
    [highwayMap.id, highwayMap],
]);

/**
 * Get a map configuration by its ID.
 * @param {string} id — e.g. 'city', 'highway'
 * @returns {object|null} Map config or null if not found
 */
export function getMapById(id) {
    return MAPS.get(id) || null;
}

/**
 * Get all available maps as an array (for lobby display).
 * @returns {{ id: string, name: string, description: string }[]}
 */
export function getAllMaps() {
    return [...MAPS.values()].map(({ id, name, description, thumbnail }) => ({
        id, name, description, thumbnail,
    }));
}

/** Default map ID used when none is specified */
export const DEFAULT_MAP_ID = 'city';
