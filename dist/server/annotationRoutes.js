import { loadAnnotations, saveAnnotation, deleteAnnotation } from '../lib/annotations.js';
export async function registerAnnotationRoutes(app) {
    app.get('/api/annotations/:pythonFile', async (req) => {
        const annotations = await loadAnnotations(req.params.pythonFile);
        return { annotations };
    });
    app.post('/api/annotations/:pythonFile', async (req) => {
        const { jsonPath, shape, layer } = req.body;
        await saveAnnotation(req.params.pythonFile, { jsonPath, shape, layer });
        return { success: true };
    });
    app.delete('/api/annotations/:pythonFile', async (req) => {
        const { jsonPath } = req.body;
        await deleteAnnotation(req.params.pythonFile, jsonPath);
        return { success: true };
    });
}
