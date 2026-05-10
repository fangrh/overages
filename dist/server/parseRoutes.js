import { parseGdsFile } from '../lib/gdsParser.js';
export async function registerParseRoutes(app) {
    app.post('/api/parse', async (req) => {
        const { gdsPath } = req.body;
        if (!gdsPath)
            throw new Error('gdsPath required');
        const geojson = await parseGdsFile(gdsPath);
        return { geojson, mode: 'full' };
    });
}
