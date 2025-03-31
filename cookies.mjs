import config from './config.mjs';

const { COOKIE_CLIENT_ID_LIFE_DAYS: COOKIE_LIFE_DAYS = 7 } = config;

var parseHost = (host) => {
    if (!host) return 'no-host-name-in-headers';
    const portOffset = host.indexOf(':');
    if (portOffset > -1) host = host.slice(0, portOffset);

    return host;
};

class Cookies {
    #req;
    #res;
    #cookies;

    constructor(req, res) {
        this.#req = req;
        this.#res = res;
        this.host = parseHost(req.headers.host);
        this.#cookies = {};
        this.#parseCookies();
    }

    get(name) {
        return this.#cookies[name];
    }

    set(name, value, httpOnly = false) {
        var expiryDate = new Date;
        expiryDate.setDate(expiryDate.getDate() + COOKIE_LIFE_DAYS);
        var expires = `expires=${expiryDate.toGMTString()}`;
        var cookie = `${name}=${value}; ${expires}; Path=/; Domain=${this.host}`;
        if (httpOnly) cookie += '; HttpOnly';

        this.#res.setHeader('Set-Cookie', cookie);
    }

    #parseCookies() {
        var { cookie } = this.#req.headers;
        if (!cookie) return;
        var cookiesArr = cookie.split(';');

        for (var partial of cookiesArr) {
            var [key, val] = partial.split('=');
            this.#cookies[key.trim()] = (val || '').trim();
        }
    }
}

export { Cookies as default }
