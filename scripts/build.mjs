import { cp, mkdtemp, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));

const publicFiles = [
  'index.html', 'sobre-a-oferta.html', 'eligibilidade.html', 'questionario.html',
  'disponibilidade.html', 'analise.html', 'admin.html', 'styles.css',
  'analise.css', 'analise.js', 'cep-mapa.js', 'disponibilidade.js', 'eligibilidade.js',
  'fluxo.js', 'questionario.js', 'demo-tracking.js', 'site-journey.js', 'assets', 'admin',
];

export async function build() {
  const directory = await mkdtemp(join(project, '.build-'));
  const output = join(project, 'dist');
  try {
    await Promise.all(publicFiles.map(file => cp(join(project, file), join(directory, file), { recursive: true })));
    await rm(output, { recursive: true, force: true });
    await rename(directory, output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await build();
}
