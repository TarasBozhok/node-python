import { readdir } from 'node:fs/promises';
import path from 'node:path';
import config from './config.mjs';
import logger from './logger.mjs';

var apiLogger = logger('console')('api');

var api = new Map;
const API_BASE_PATH = path.join(process.cwd(), './api');

var cacheFile = async function(fileName) {
	let module = await import(path.join(API_BASE_PATH, fileName));
	let endpoint = path.basename(fileName, path.extname(fileName));
	api.set(endpoint, module.default);
};

await readdir(API_BASE_PATH)
	.then((fileNames) => {
		return Promise.all(fileNames.map(cacheFile));
	})
	.catch((err) => {
		apiLogger.error(`API handler initialization error: ${err.message}`);
	});

if (api.size === 0) apiLogger.error('No API handlers available');

function API(connector) {
	if (!new.target) return new API(connector);

	this.connector = connector;

	this.getResponse = function(url, data) {
		let apiFunction = api.get(url.slice(1));
		return apiFunction(data, this.connector, config);
	}
};

API.hasEndpoint = function(url) { return api.has(url.slice(1)) };

API.parseRequest = async function(req) {
	var { url, method } = req;
	var [, query] = url.split('?');

	if (method === 'POST') {
		var bufferChunks = [];
		for await (var chunk of req) bufferChunks.push(chunk);
		return Buffer.concat(bufferChunks).toString();
	} else {
		var data = query ? query.split('&').reduce(
			(acc, el) => {
				let [pname, pvalue] = el.split('=');
				return (acc[pname] = pvalue, acc);
			}, {}) : {};
		return JSON.stringify(data);
	}
};

API.generateClientId = function() {
	//return crypto.randomUUID(); //e0951d5f-9234-43ba-9bea-79aba7bf8525
	return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); //m7u5seog-i5m0hx3kra8
};

export default API;