import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import path from 'node:path';
import config from './config.mjs';
import logger from './logger.mjs';

const { PROCESSING_TIMEOUT = 10_000 } = config;

var pythonLogger = logger('console')('python');

class Python extends EventEmitter {
    #queue;
    constructor() {
        super();
        this.#queue = [];
        this.process = spawn(
            config.PYTHON_ALIAS, 
            [config.PYTHON_CONNECTOR_FILENAME],
            { cwd: path.join(process.cwd(), config.AI_MODEL_FOLDER_PATH) }
        );
        this.process.stdout.setEncoding('utf8');

        this.process.on('spawn', (data) => {
            pythonLogger.info(`Process ${this.process.pid} started`);
            this.emit('connected', data);
        });
        this.process.on('close', (code) => {
            pythonLogger.warn(`Process ${this.process.pid} closed with ${code} code`);
            this.#clearQueue();
            this.emit('restart', code);
        });

        this.process.stdout.on('data', (data) => {
            var message = data.toString().trim();
            if (message === 'INITIALIZED') {
                this.emit('initialized', this);
                return;
            }
            this.#dequeueRequest(null, message);
        });
        this.process.stderr.on('data', (data) => {
            pythonLogger.warn(`Process stderr. Data: ${data}`);
            this.#dequeueRequest(true/*error*/);
        });

        this.on('error', (data) => {
            pythonLogger.error(`Process general error. ${data}`);
            this.#clearQueue();
            this.emit('restart', data);
        });
        this.on('transmitData', (requestBody, resolve) => {
            try {
                var dataToSend = {
                    events: JSON.parse(requestBody)
                };
            } catch (_) {
                resolve({ error: true, message: 'PARSE_ERROR' });
            }
            this.process.stdin.write(JSON.stringify(dataToSend) + '\n');
            this.#enqueueRequest(resolve);
        });
    }

    #enqueueRequest(resolve) {
        var timeoutId = setTimeout(() => resolve({ error: true }), PROCESSING_TIMEOUT);
        this.#queue.push({ resolve, timeoutId });
    }

    #dequeueRequest(err, message) {
        if (this.#queue.length === 0) return;
        var { resolve, timeoutId } = this.#queue.shift();
        clearTimeout(timeoutId);
        resolve({ error: !!err, decision: message });
    }

    #clearQueue() {
        let queueLength = this.#queue.length;
        for (let i = 0; i < queueLength; i++) {
            this.#dequeueRequest(true);
        }
        this.#queue = [];
    }
}

export default Python;