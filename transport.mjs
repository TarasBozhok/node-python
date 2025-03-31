import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import logger from './logger.mjs';
import config from './config.mjs';

var transportLogger = logger('console')('TLS');

export default function(onRequest) {
	var port = config.SERVER_HTTP_PORT;
	var TLSOptions = {};
	const TLSFolderPath = path.join(process.cwd(), config.TLS_FOLDER_PATH);
	var isSecureConnection = false;

	try {
		TLSOptions.key = readFileSync(path.join(TLSFolderPath, config.TLS_KEY_FILENAME));
		TLSOptions.cert = readFileSync(path.join(TLSFolderPath, config.TLS_CERT_FILENAME));
	} catch(err) {
		transportLogger.warn('TLS is not configured properly. HTTP will be used for transport.', err.message);
	};

	var createServer = createHttpServer;

	if (TLSOptions.key && TLSOptions.cert) {
		isSecureConnection = true;
		createServer = (...args) => createHttpsServer(TLSOptions, ...args);
		port = config.SERVER_HTTPS_PORT;
	}

	var server = createServer(onRequest);

	server.port = port;
	server.isSecureConnection = isSecureConnection;

	return server;
}