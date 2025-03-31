import API from './api.mjs';
import getStatic from './static.mjs';
import createServer from './transport.mjs';
import logger from './logger.mjs';
import Cookies from './cookies.mjs';
import { initPool } from './connectorPool.mjs';

var consoleLogger = logger('console');
var serverLogger = consoleLogger('server');
var systemLogger = consoleLogger('system');
var apiFileLogger = logger('file')('API');

var onRequest = async function(req, res) {
      //req.setTimeout(30_000);
      //res.setTimeout(30_000);
    var { url: fullUrl, method } = req;
    var [ url ] = fullUrl.split('?');
    serverLogger.debug(`Incoming request: ${method} ${fullUrl}`);

    if (API.hasEndpoint(url) && connectorPool.hasAvailable()) {
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Credentials', server.isSecureConnection.toString());
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin, X-Requested-With');
            res.setHeader('Access-Control-Max-Age', '3600');
            res.statusCode = 204;
            return res.end();
        }

        res.setHeader('Content-Type', 'application/json');

        var cookies = new Cookies(req, res);
        var clientId = cookies.get('clientId');
        if (!clientId) {
            clientId = API.generateClientId();
            cookies.set('clientId', clientId, true/*httpOnly*/);
        }

        var data = await API.parseRequest(req);
        apiFileLogger.debug(`{${clientId}} Request: ${data}`);
        var apiResponse = await connectorPool.getConnectedApi().getResponse(url, data);
        var responseString = JSON.stringify(apiResponse);
        apiFileLogger.debug(`{${clientId}} Response: ${responseString}`);

        res.statusCode = apiResponse.error ? 500 : 200;
        res.end(responseString);
    } else {
        var staticResponse = await getStatic(url);
        res.statusCode = staticResponse.code;

        if (staticResponse.headers?.length > 0) {
            staticResponse.headers.forEach(([headerKey, headerValue]) => {
                res.setHeader(headerKey, headerValue);
            });
        }
        res.end(staticResponse.content);		
    }	
};

var server = createServer(onRequest);
startPortListening();

var connectorPool = initPool();
connectorPool.on('ready', startPortListening);

server.on('error', (err) => {
    systemLogger.error('SERVER ERROR', err);
    gracefulShutdown();
});
server.on('dropRequest', () => {
    systemLogger.warn('MAXIMUM CONNECTIONS REACHED');
});

process.on('uncaughtException', err => {
    systemLogger.error('UNCAUGHT', err);
    gracefulShutdown();
});
process.on('unhandledRejection', (reason, promise) => {
    systemLogger.error('Unhandled Rejection', reason, promise);
});
process.on('SIGINT', () => {
    gracefulShutdown();
});

function startPortListening() {
    if (!server.listening) server.listen(server.port, () => serverLogger.info(`Server listening ${server.port} port`));
}

var gracefulShutdown = function() {
    systemLogger.info('Graceful shutdown');
    connectorPool.releaseResources();
    logger.releaseResources();
    if (server.listening) {
        setImmediate(() => {
              server.close((error) => {
                if (error) {
                    console.log(error);
                    process.exit(1);
                }
                process.exit(0);
            });
          });
        setTimeout(() => (server.closeAllConnections(), process.exit(1)), 2000);
    } else {
        process.exit(0);
    }
};
