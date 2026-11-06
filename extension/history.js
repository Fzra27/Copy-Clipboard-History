// Pure history rules, shared by the GNOME extension and unit tests.
export const LIMIT = 200;
export const MAX_TEXT = 20000;
export const MAX_IMAGE = 8 * 1024 * 1024;
export const MAX_IMAGE_TOTAL = 64 * 1024 * 1024;
export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const validHash = hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash);
export const keyOf = entry => entry.type === 'image' ? `image:${entry.hash}` : `text:${entry.text}`;

export function normalizeEntries(items, imageExists = () => true) {
    if (!Array.isArray(items))
        return [];
    const entries = [];
    const seen = new Map();
    for (const item of items) {
        if (!item || typeof item !== 'object')
            continue;
        let entry;
        if (item.type === 'image') {
            if (!validHash(item.hash) || !IMAGE_MIMES.includes(item.mime) ||
                !Number.isInteger(item.size) || item.size < 1 || item.size > MAX_IMAGE ||
                !imageExists(item.hash))
                continue;
            entry = {type: 'image', hash: item.hash, mime: item.mime,
                size: item.size, pinned: item.pinned === true};
        } else if ((item.type === undefined || item.type === 'text') &&
            typeof item.text === 'string' && item.text.trim() && item.text.length <= MAX_TEXT) {
            entry = {type: 'text', text: item.text, pinned: item.pinned === true};
        } else {
            continue;
        }
        const key = keyOf(entry);
        if (seen.has(key)) {
            seen.get(key).pinned ||= entry.pinned;
        } else {
            seen.set(key, entry);
            entries.push(entry);
        }
    }
    return trimEntries(entries);
}

export function trimEntries(items, limit = LIMIT, budget = MAX_IMAGE_TOTAL) {
    const entries = [...items];
    let size = entries.reduce((total, e) => total + (e.type === 'image' ? e.size : 0), 0);
    for (let i = entries.length - 1; i >= 0 && (entries.length > limit || size > budget); i--) {
        if (!entries[i].pinned) {
            size -= entries[i].type === 'image' ? entries[i].size : 0;
            entries.splice(i, 1);
        }
    }
    // Hard caps also apply to pinned entries; oldest pins go last.
    while (entries.length && (entries.length > limit || size > budget)) {
        const entry = entries.pop();
        size -= entry.type === 'image' ? entry.size : 0;
    }
    return entries;
}

export function remember(entries, incoming) {
    const key = keyOf(incoming);
    const old = entries.find(e => keyOf(e) === key);
    return trimEntries([{...incoming, pinned: old?.pinned ?? false},
        ...entries.filter(e => keyOf(e) !== key)]);
}

export function matchesQuery(entry, query) {
    const text = entry.type === 'image' ? `image picture screenshot ${entry.mime}` : entry.text;
    return text.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}
