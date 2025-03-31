import path from 'node:path';
import { readFile } from 'node:fs/promises';
import mimeTypes from './mimeTypes.mjs';

var cache = new Map;
const STATIC_WD = path.join(process.cwd(), './static');
const key404 = Symbol('404');

await readFile(path.join(STATIC_WD, './404.html'), 'utf8')
	.then((fileContent) => {
		cache.set(key404, fileContent);		
	})
	.catch(() => {
		cache.set(key404, 'Page not found...');
	});

var get404 = function() {
	return Promise.resolve({
		code: 404,
		content: cache.get(key404),
		headers: [['Content-Type', mimeTypes.html]]
	});
}

export default function getStatic(url) {
	if (url === '/') url += 'index.html';

	var staticPath = path.join(STATIC_WD, url);

	if (!staticPath.startsWith(STATIC_WD)) {
		return get404();
	}

	if (cache.has(staticPath)) return Promise.resolve(cache.get(staticPath));

	return readFile(staticPath, 'utf8')
		.then((fileContent) => {
			var staticResponse = {
				code: 200,
				content: fileContent,
				headers: [['Content-Type', mimeTypes[path.extname(staticPath).slice(1)] || mimeTypes.default]]
			}
			cache.set(staticPath, staticResponse);

			return staticResponse;
		})
		.catch(() => {
			return get404();
		});
}
