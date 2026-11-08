const BASEMAP_LANGUAGE = 'es';

function vectorStyleUrl(style, apiKey) {
  const styleId = style === 'dark-gray' ? 'dark-gray' : 'light-gray';
  const params = new URLSearchParams({ token: apiKey });
  if (BASEMAP_LANGUAGE) params.set('language', BASEMAP_LANGUAGE);
  return `https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/${styleId}?${params}`;
}

function rasterFallbackStyle(style) {
  const shade = style === 'dark-gray' ? 'Dark' : 'Light';
  return {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: [`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${shade}_Gray_Base/MapServer/tile/{z}/{y}/{x}`],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 16,
        attribution: 'Tiles © Esri',
      },
    },
    layers: [{ id: 'esri-gray-canvas', type: 'raster', source: 'esri' }],
  };
}

/** Strategy: with key - vector tiles ArcGIS, without - rastr Esri. */
export function basemapStyle(style, apiKey) {
  return apiKey ? vectorStyleUrl(style, apiKey) : rasterFallbackStyle(style);
}
