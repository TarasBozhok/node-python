import { availableParallelism } from 'node:os';
import { once, EventEmitter } from 'node:events';

import API from './api.mjs';
import Python from './pythonConnector.mjs';
import config from './config.mjs';
import logger from './logger.mjs';

const { MAX_THREADS: configMaxThreads = 1 } = config;
const MAX_THREADS = Math.min(configMaxThreads, availableParallelism());
var consoleLogger = logger('console');
var poolLogger = consoleLogger('pool');
var ee = new EventEmitter;

var roundRobin = function() {
    var pool = [];
    var currentIndex = 0;

    return {
        add(connectedApi) {
            pool.push(connectedApi);
        },
        getNext() {
            if (currentIndex > this.size() - 1) currentIndex = 0;
            return pool[currentIndex++];
        },
        size() {
            return pool.length;
        },
        remove(connector) {
            var connectedApiIndex = pool.findIndex((connectedApi) => connectedApi.connector === connector);

            if (connectedApiIndex > -1) {
                var connectedApi = pool.splice(connectedApiIndex, 1)[0];
                clearResource(connectedApi);
            }
        },
        clear() {
            pool.forEach((connectedApi) => {
                clearResource(connectedApi);
            });
            pool = [];
        }
    }
};
var threadPool = roundRobin();

var poolApi = {
    releaseResources() {
        threadPool.clear();
    },
    getConnectedApi() {
        return threadPool.getNext()
    },
    hasAvailable() {
        return threadPool.size() > 0;
    }
};
Object.setPrototypeOf(poolApi, ee);

var clearResource = function(connectedApi) {
    try {
        connectedApi.connector?.removeAllListeners();
        connectedApi.connector.process?.kill();
        connectedApi.connector = null;
        connectedApi = null;
    } catch(err) {
        poolLogger.error(`Error releasing connector resource. ${err.message}`);
    }
};

export function initPool(limit) {
    var threadsMax = limit || MAX_THREADS;
    var initializationPromises = [];
    for (let i = 0; i < threadsMax; i++) {
        var pythonConnector = new Python;

        pythonConnector.on('restart', (data) => {
            threadPool.remove(pythonConnector);
            initPool(1);
        });
        initializationPromises.push(once(pythonConnector, 'initialized'));
    }
    Promise.allSettled(initializationPromises)
        .then((results) => {
            var connectedPids = [];
            results.forEach((result) => {
                if (result.status === 'fulfilled') {
                    var connector = Array.isArray(result.value) ? result.value[0] : result.value;
                    var connectedApi = new API(connector);
                    threadPool.add(connectedApi);
                    poolApi.emit('ready');
                    connectedPids.push(connector.process?.pid);
                }
            });
            poolLogger.info(`Initialized. ${connectedPids.length} process(es) added. Total threads ${threadPool.size()}`);
            poolLogger.info('Process ID(s): ', connectedPids);
        })
        .catch((err) => poolLogger.error(`Initialization issue. ${err.message}`));

    return poolApi;
}
