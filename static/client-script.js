(function() {
    'use strict';
    if (!window.Promise || !window.fetch) return;

    var dl;
    var storage = sessionStorage; //localStorage
    var requestUrl = 'https://127.0.0.1';
    var requestDebounceMS = 500;
    var storageLimit = 30;
    var STORAGE_KEY = 'shop-predictions';
    var dlEventsToTrack = {
        page_view: ['page_view', 'gtm.page_view'],
        add_to_cart: ['add_to_cart', 'gtm.add_to_cart'],
        scroll: ['scroll', 'gtm.scroll', 'gtm.scroll_10', 'gtm.scroll_25', 'gtm.scroll_50', 'gtm.scrollDepth'],
        view_item: ['view_item', 'gtm.view_item'],
        click: ['click', 'gtm.click', 'gtm.link_click', 'gtm.linkClick']
    };
    var flatEventsMap = {};
    for (var evtKey in dlEventsToTrack) {
        dlEventsToTrack[evtKey].forEach(function(namedEvt) {
            flatEventsMap[namedEvt] = evtKey;
        });
    }
    var isDebugMode = storage.getItem('debug');

    var initializationTimerId = setInterval(init, 500);
    setTimeout(function() { clearInterval(initializationTimerId) }, 5000);
    
    function init() {
        dl = getDLReference();
        if (!dl) return;
        clearInterval(initializationTimerId);
        updateStorage(dl);
        setDLPushWrapper(dl);
        logger('Predictions initialized');
    }
    var updateStorage = function(data) {
        if (data) {
            var dataToProcess = Array.isArray(data) ? data : [data];
            var newData = prepareDataArray(dataToProcess);
            if (newData.length === 0) return false;
            try {
                var storedData = JSON.parse(storage.getItem(STORAGE_KEY)) || [];
                var updatedData = storedData.concat(newData).slice(-storageLimit);
                storage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
                logger('New event recorded: ' + JSON.stringify(newData[0]));
                return true;
            } catch(_) {
                return false;
            }
        }
        return false;
    };
    var setDLPushWrapper = function(dl) {
        var oldPush = dl.push;
        dl.push = function() {
            oldPush.apply(dl, arguments);
            Promise
                .resolve(arguments[0])
                .then(function(eventObjectData) { return updateStorage(eventObjectData) })
                .then(function(isUpdateSuccess) { if (isUpdateSuccess) makePrediction() })
                .catch(logger);
        }
    };
    var makePrediction = function() {
        logger('Request sent to server');
        fetch(requestUrl, {
            method: 'post',
            body: storage.getItem(STORAGE_KEY)
        })
        .then(function(resp) { return resp.json() })
        .then(function(responseObject) {
            if (!responseObject.error) {
                if (responseObject.decision === 'Yes') {
                    storage.removeItem(STORAGE_KEY);
                }
                logger('The decision is ' + responseObject.decision);
            } else logger('Server response error. ' + JSON.stringify(responseObject));
        })
        .catch(logger);
    };
    var getDLReference = function() {
        if (window.google_tag_manager) {
            for (var key in window.google_tag_manager) {
                if (window.google_tag_manager[key].hasOwnProperty('gtmDom')) {
                    return window[key];
                }
            }
        }
        return window['dataLayer'];
    };
    var prepareDataArray = function(dataArrayToProcess) {
        return dataArrayToProcess
            .map(function(el) {
                if (!Object.hasOwn(el, 'event') && el[0] === 'event') return { event: el[1] }
                return el;
            })
            .filter(function(el) { return el.event in flatEventsMap })
            .map(mapEventObject);
    };
    var mapEventObject = function(element) {
        var mappedEvent = { timestamp: Date.now().toString() };
        mappedEvent.action_type = flatEventsMap[element.event];
        if (mappedEvent.action_type === 'page_view') mappedEvent.page_name = document.title;
        return mappedEvent;
    };
    var debounce = function(fn) {
        var timerId;
        return function() {
            clearTimeout(timerId);
            timerId = setTimeout(function() { fn.apply(undefined, arguments) }, requestDebounceMS);
        }
    };
    makePrediction = debounce(makePrediction);
    var logger = function(msg) {
        if (isDebugMode) console.log('%c' + msg, 'background: #222; color: #bada55');
    };
})()
