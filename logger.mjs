import path from 'node:path';
import fs from 'node:fs/promises';

var logger = (source) => (category) => {
    var loggerInstance = Object.create({}, {
        'category': {
                value: category,
                enumerable: true
            }
    });

    if (source === 'console') {
        loggerInstance.msgFormatter = formatConsoleMsg;
        loggerInstance.write = (text, level) => (level === 'error' ? console.error : console.log)(text);
    }

    if (source === 'file') {
        loggerInstance.msgFormatter = formatFileMsg;
        loggerInstance.write = (text, level) => fileSystemResources[level].stream.write(text);
    }

    return new Proxy(loggerInstance, {
        get(target, prop, reciever) {
            if (prop in loggerAPI) return loggerAPI[prop];
            return Reflect.get(target, prop, reciever);
        }
    });
};
logger.releaseResources = function() {
    Object.keys(fileSystemResources).forEach((fileSystemEntry) => {
        if (fileSystemEntry.stream) fileSystemEntry.stream.end();
        if (fileSystemEntry.descriptor) fileSystemEntry.descriptor.close();
    });
};

var loggerAPI = ['error', 'warn', 'debug', 'info'].reduce((acc, level) => (acc[level] = function(...args) { logMessageByLevel.call(this, level, ...args) }, acc), {});

var logMessageByLevel = function(level, ...args) {
    queueMicrotask(() => {
        try {
            var text = this.msgFormatter(args, level, this.category);
            this.write(text, level);
        } catch (err) {
            console.error(`Logger code issue in ${level.toUpperCase()}: ${err.message}`);
        }
    });
};

var formatConsoleMsg = function(logMessages, level, category) {
    let spacer = LEVEL_SPACERS[level] || '';
    let prefix = category ? `[${category.toUpperCase()}] ` : '';
    let text = prefix + formatMessages(logMessages);
    let sizedSpacer = spacer.repeat(Math.min(text.length, COLUMNS_NUM));

    return '\n' + CONSOLE_COLORS[level] + sizedSpacer + '\n' + text  + '\n' + sizedSpacer + CONSOLE_COLORS.normal;
};

var formatFileMsg = function(logMessages, level, category) {
    let timeEntry = `<${new Date().toLocaleTimeString()}>`;
    let prefix = category ? `[${category.toUpperCase()}]` : '';

    return timeEntry + prefix + '-' + formatMessages(logMessages)  + '\n';
};

var formatMessages = function(logMessages) {
    if (!Array.isArray(logMessages)) logMessages = [logMessages];

    return logMessages
        .map((msgEntry) => {
            if (typeof msgEntry === 'string') return msgEntry;
            if (msgEntry instanceof Error) return msgEntry.stack;
            if (msgEntry instanceof Object) return JSON.stringify(msgEntry);
            return msgEntry + '';
        })
        .join('\n');
};

var generateFileName = function (level) {
    let date = new Date;
    let datePortion = date.getDate().toString().padStart(2, '0') + date.getMonth().toString().padStart(2, '0') + date.getFullYear();
    let fileExt = '.log';
    return level + '-' + datePortion + fileExt;
};

const LOGS_WD = path.join(process.cwd(), './logs');
var fileSystemResources = {};

await fs.mkdir(LOGS_WD)
    .catch(()=>{ /*Already exists*/ });

await Promise.all(Object.keys(loggerAPI).map((level) => {
    return fs
        .open(path.join(LOGS_WD, generateFileName(level)), 'a')
        .then((fd) => {
            fileSystemResources[level] = {
                descriptor: fd,
                stream: fd.createWriteStream()
            }
        })
        .catch((err) => { console.error(`Log files initialization error. ${err.message}`); });
}));

const CONSOLE_COLORS = {
  error: '\x1b[0;31m',
  warn: '\x1b[1;33m',
  info: '\x1b[1;37m',
  debug: '\x1b[0m',
  normal: '\x1b[0m',
};

const LEVEL_SPACERS = {
  error: '#',
  warn: '-',
  info: '.',
};

const COLUMNS_NUM = process.stdout.columns;

export default logger;