import { PbfReader, VectorTile } from './assets/cep-vector-decoder.js';

const mainRoads = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);

export async function readVectorSource(signal) {
  const response = await fetch('https://tiles.openfreemap.org/planet', { signal });
  if (!response.ok) throw new Error('Mapa indisponível.');
  const { tiles, maxzoom } = await response.json();
  if (!tiles?.[0]?.startsWith('https://tiles.openfreemap.org/') || !Number.isInteger(maxzoom)) {
    throw new Error('Fonte do mapa inválida.');
  }
  return { template: tiles[0], maxZoom: maxzoom };
}

function drawFeatures(context, layer, tileSize, filter) {
  context.beginPath();
  if (!layer) return;

  for (let index = 0; index < layer.length; index++) {
    const feature = layer.feature(index);
    if (!filter(feature)) continue;
    const scale = tileSize / feature.extent;

    for (const path of feature.loadGeometry()) {
      if (!path.length) continue;
      context.moveTo(path[0].x * scale, path[0].y * scale);
      for (const point of path.slice(1)) context.lineTo(point.x * scale, point.y * scale);
      if (feature.type === 3) context.closePath();
    }
  }
}

export async function paintVectorTile(canvas, url, size, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Trecho do mapa indisponível.');
  const { layers } = new VectorTile(new PbfReader(await response.arrayBuffer()));
  const density = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(size * density);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Mapa não pode ser desenhado.');
  context.scale(density, density);
  context.fillStyle = '#eaeaea';
  context.fillRect(0, 0, size, size);

  const polygon = feature => feature.type === 3;
  drawFeatures(context, layers.park, size, polygon);
  context.fillStyle = '#dedede';
  context.fill('evenodd');
  drawFeatures(context, layers.water, size, polygon);
  context.fillStyle = '#c9c9c9';
  context.fill('evenodd');

  context.lineJoin = 'round';
  context.lineCap = 'round';
  const road = (feature, test) => feature.type === 2 && feature.properties.brunnel !== 'tunnel' && test(feature.properties.class);
  drawFeatures(context, layers.transportation, size, feature => road(feature, kind => kind === 'minor'));
  context.lineWidth = 1.85;
  context.strokeStyle = '#fff';
  context.stroke();

  drawFeatures(context, layers.transportation, size, feature => road(feature, kind => mainRoads.has(kind)));
  context.lineWidth = 4.1;
  context.strokeStyle = '#b5b5b5';
  context.stroke();
  context.lineWidth = 2.45;
  context.strokeStyle = '#fff';
  context.stroke();
}
