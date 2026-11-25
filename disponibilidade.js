const postalForm = document.getElementById('postal-form');
const postalCode = document.getElementById('postal-code');
const postalError = document.getElementById('postal-error');
const feedback = document.getElementById('availability-feedback');
const loading = document.getElementById('availability-loading');
const result = document.getElementById('availability-result');
const title = document.getElementById('availability-title');
const description = document.getElementById('availability-description');
const postalInstructions = description.textContent;
const progress = document.querySelector('.step-progress');
const map = document.getElementById('cep-map');
const mapStage = map.parentElement;
const mapCredit = mapStage.querySelector('.cep-map-credit');
const vectorCredit = mapCredit.querySelector('.cep-vector-credit');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let querying = false;
let mapPoint;
let mapRequest;
let exitTimer;

function hideLoading() {
  loading.hidden = true;
  loading.inert = false;
  loading.classList.remove('is-leaving');
  mapPoint = undefined;
  mapRequest?.abort();
  map.replaceChildren();
  mapStage.classList.remove('has-map');
  mapCredit.hidden = true;
}

function showPane(pane, copy, percentage) {
  window.clearTimeout(exitTimer);
  const fadeLoading = pane === result && !loading.hidden && !reducedMotion.matches;
  postalForm.hidden = pane !== postalForm;
  feedback.hidden = pane === postalForm;
  result.hidden = pane !== result;
  if (fadeLoading) {
    loading.inert = true;
    loading.classList.add('is-leaving');
    exitTimer = window.setTimeout(hideLoading, 260);
  } else {
    hideLoading();
    loading.hidden = pane !== loading;
  }
  description.textContent = copy;
  description.hidden = !copy;
  progress.value = percentage;
  title.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function showPostalForm() {
  showPane(postalForm, postalInstructions, 57);
}

function showError(message, invalidPostalCode = false) {
  showPostalForm();
  postalError.textContent = message;
  postalError.hidden = false;
  if (invalidPostalCode) postalCode.setAttribute('aria-invalid', 'true');
  postalCode.focus({ preventScroll: true });
}

postalCode.addEventListener('input', () => {
  postalError.hidden = true;
  postalCode.removeAttribute('aria-invalid');
  const digits = postalCode.value.replace(/\D/g, '').slice(0, 8);
  postalCode.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
});

async function readJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Consulta indisponível.');
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function validRegion(city, state) {
  return typeof city === 'string' && city.trim() && /^[A-Z]{2}$/.test(state);
}

async function lookupRegion(digits) {
  const primary = await readJson(`https://brasilapi.com.br/api/cep/v2/${digits}`, 2400).catch(() => null);
  let { city, state } = primary ?? {};
  let coordinates = primary?.location?.coordinates;
  if (!validRegion(city, state)) {
    const alternate = await readJson(`https://viacep.com.br/ws/${digits}/json/`, 4000);
    if (alternate.erro) return null;
    ({ localidade: city, uf: state } = alternate);
    if (!validRegion(city, state)) throw new Error('Resposta do CEP incompleta.');
    coordinates = null;
  }

  const latitude = Number(coordinates?.latitude);
  const longitude = Number(coordinates?.longitude);
  if (latitude > -35 && latitude < 6 && longitude > -75 && longitude < -27) {
    return { city, state, point: { latitude, longitude, zoom: 15 } };
  }

  const key = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const dataset = await readJson('assets/cep-municipios.json', 1800).catch(() => null);
  const seat = dataset?.municipios?.[state]?.[key];
  return { city, state, point: seat && { latitude: seat[0], longitude: seat[1], zoom: 13 } };
}

function mapTiles(point, width, height, zoom) {
  const { latitude, longitude } = point;
  const size = 256 * 2 ** (point.zoom - zoom);
  const world = size * 2 ** zoom;
  // OpenStreetMap tiles use the Web Mercator projection.
  const centerX = world * (longitude + 180) / 360;
  const centerY = world * (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2;
  const left = Math.round(centerX - width / 2);
  const top = Math.round(centerY - height / 2);
  const tiles = [];

  for (let x = Math.floor(left / size); x * size < left + width; x++) {
    for (let y = Math.floor(top / size); y * size < top + height; y++) {
      tiles.push({ x, y, left: x * size - left, top: y * size - top, size });
    }
  }
  return tiles;
}

function placeTile(element, tile) {
  element.style.left = `${tile.left}px`;
  element.style.top = `${tile.top}px`;
  element.style.width = element.style.height = `${tile.size}px`;
  map.append(element);
}

function showTile(element, vector) {
  if (element.parentNode !== map) return;
  element.classList.add('is-loaded');
  mapStage.classList.add('has-map');
  mapCredit.hidden = false;
  vectorCredit.hidden = !vector;
}

function showRasterMap(point, width, height) {
  map.replaceChildren();
  for (const tile of mapTiles(point, width, height, point.zoom)) {
    const image = document.createElement('img');
    image.alt = '';
    image.addEventListener('load', () => showTile(image, false), { once: true });
    placeTile(image, tile);
    image.src = `https://tile.openstreetmap.org/${point.zoom}/${tile.x}/${tile.y}.png`;
  }
}

async function renderCepMap() {
  if (!mapPoint || loading.hidden || loading.inert) return;
  const width = map.clientWidth;
  const height = map.clientHeight;
  if (!width || !height) return;

  const point = mapPoint;
  mapRequest?.abort();
  mapRequest = new AbortController();
  const { signal } = mapRequest;
  try {
    const { readVectorSource, paintVectorTile } = await import('./cep-mapa.js?v=1');
    if (signal.aborted) return;
    const { template, maxZoom } = await readVectorSource(signal);
    if (signal.aborted || loading.inert) return;

    const zoom = Math.min(point.zoom, maxZoom);
    map.replaceChildren();
    const requests = mapTiles(point, width, height, zoom).map(async tile => {
      const canvas = document.createElement('canvas');
      const url = template.replace('{z}', zoom).replace('{x}', tile.x).replace('{y}', tile.y);
      placeTile(canvas, tile);
      await paintVectorTile(canvas, url, tile.size, signal);
      if (!signal.aborted) showTile(canvas, true);
    });
    const results = await Promise.allSettled(requests);
    if (results.every(tile => tile.status === 'rejected')) throw new Error('Mapa indisponível.');
  } catch {
    if (!signal.aborted && !loading.inert) showRasterMap(point, width, height);
  }
}

new ResizeObserver(renderCepMap).observe(map);

postalForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (querying) return;

  const formattedPostal = postalCode.value;
  const digits = formattedPostal.replace(/\D/g, '');
  if (digits.length !== 8) {
    showError('Confira se você digitou os 8 números do CEP.', true);
    return;
  }

  querying = true;
  window.campaignDemo?.track?.('lookup_started');
  const { profileComplete, answers } = campaignFlow.read();
  campaignFlow.save({ profileComplete, answers });
  postalError.hidden = true;
  postalCode.removeAttribute('aria-invalid');
  document.getElementById('loading-postal').textContent = formattedPostal;
  showPane(loading, '', 64);

  try {
    const [region] = await Promise.all([
      lookupRegion(digits).then(details => {
        mapPoint = details?.point;
        renderCepMap();
        return details;
      }),
      new Promise(resolve => window.setTimeout(resolve, 2800)),
    ]);
    if (!region) {
      window.campaignDemo?.track?.('lookup_not_found');
      showError('Não encontramos esse CEP. Confira os números e tente de novo.', true);
      return;
    }

    document.getElementById('result-region').textContent = `${region.city}, ${region.state}`;
    document.getElementById('stock-city').textContent = region.city;
    document.getElementById('result-postal').textContent = formattedPostal;
    campaignFlow.save({ profileComplete, answers, region: { city: region.city, state: region.state } });
    showPane(result, '', 75);
    window.campaignDemo?.track?.('lookup_resolved');
  } catch {
    window.campaignDemo?.track?.('lookup_failed');
    showError('A consulta está indisponível agora. Tente de novo em instantes.');
  } finally {
    querying = false;
  }
});

result.querySelector('.edit-postal').addEventListener('click', () => {
  window.campaignDemo?.track?.('lookup_changed');
  const { profileComplete, answers } = campaignFlow.read();
  campaignFlow.save({ profileComplete, answers });
  showPostalForm();
  postalCode.focus({ preventScroll: true });
  postalCode.select();
});
