import * as url from 'url';
export const get__filename = () => url.fileURLToPath(import.meta.url);
export const get__dirname = () => url.fileURLToPath(new URL('.', import.meta.url));