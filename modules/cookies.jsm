var EXPORTED_SYMBOLS = ['IcingCookies'];

// Import database module
Components.utils.import('resource://icing/database.jsm');

// Import setTimeout/clearTimeout
Components.utils.import('resource://gre/modules/Timer.jsm');

// Import services module (for nsICookieManager2)
Components.utils.import('resource://gre/modules/Services.jsm');

// Import logging module
Components.utils.import('resource://icing/log4moz.jsm');

// Import icing logger
Components.utils.import('resource://icing/logging.jsm');

// Alias commonly used references
const { classes: Cc, interfaces: Ci } = Components;

const ONE_SECOND = 1000;

/**
 * Delay 10 seconds between when the last cookie was set and when the server
 * will be updated with the cookies
 */
const SEND_INTERVAL = 10 * ONE_SECOND;

/**
 * Check for updated cookies from the server every minute.
 */
const CHECK_INTERVAL = 60 * ONE_SECOND;

var IcingCookies = (function() {

    /**
     * Whether or not the cookie service is currently servicing
     */
    var initialized = false;

    /**
     * Logging instance
     */
    var logger;

    /**
     * Flag indicating that cookies are currently being synchronized from the
     * server. If true, observed cookie changes will be ignored.
     */
    var settingFlag = false;

    /**
     * A JavaScript representation of relevant cookies. This object should be
     * kept in-sync with the local sqlite database. Keys in the object are the
     * domains to sync, and values are objects with the following members:
     *   server: the server address for syncing
     *   sendTimer: A token returned from setTimeout. For sending to server.
     *   requestTimer: A token returned from setTimeout. For receiving from 
     *   server.
     */
    var cookieDomains = { };

    /**
     * Start listening to cookie events
     */
    var initService = function() {
        initialized = true;

        // Get logger instance
        logger = Log4Moz.repository.getLogger('Icing.CookieLogger');
        logger.level = Log4Moz.Level['Warn'];
        logger.info('Initialized icing cookie engine');

        let service = Cc['@mozilla.org/observer-service;1']
            .getService(Ci.nsIObserverService);
        service.addObserver(cookieObserver, 'cookie-changed', false);

        // Immediately populate listening domains
        IcingDatabase.getItems(updateDomains);
    };

    /**
     * Object implementing the observer interface for cookie events. Routes
     * cookie events to their proper subroutines.
     */
    var cookieObserver = {
        observe: function(subject, topic, data) {
            if (!settingFlag && topic == 'cookie-changed') {

                // Can occur if cookies were cleared or something
                if (subject == null) {
                    return;
                }

                let cookie = subject.QueryInterface(Ci.nsICookie2);

                switch (data) {
                    case 'added':
                    case 'changed':
                    case 'deleted':
                        if (cookieDomains[cookie.rawHost]) {
                            // Only respond to relevant cookies
                            logger.trace('[' + cookie.rawHost + '] ' +
                                cookie.name + ' set.');
                            cookieUpdated(cookie);
                        }
                        break;
                    case 'batch-deleted':
                    case 'cleared':
                    case 'reload':
                        logger.warn('Non-implemented cookie method: ' + data);
                        return;
                }
            }
        }
    };

    /**
     * Flag a cookie as being updated. Updated means added, changed, or removed.
     * This will queue traffic to be sent to the server.
     * @param cookie an nsICookie2 instance
     */
    var cookieUpdated = function(cookie) {
        let domain = cookie.rawHost;
        
        // Find the server for the domain
        let server = cookieDomains[domain].server;
        let username = cookieDomains[domain].user;
        let password = cookieDomains[domain].pass;

        /* Cookies are sent to the server in batches to reduce network traffic.
         * Reset the current wait time, if any. Then queue a synchronization
         * request.
         */
        clearTimeout(cookieDomains[domain].sendTimer);
        cookieDomains[domain].sendTimer = setTimeout(function(domain) {
            logger.info('[' + domain + '] Updating server');

            let json = getDomainJSON(domain);

            logger.debug('[' + domain + '] Sending ' + 
                mgr.countCookiesFromHost(domain) + ' cookies to server.');

            // Notify the server
            let r = Cc['@mozilla.org/xmlextras/xmlhttprequest;1']
                .createInstance(Ci.nsIXMLHttpRequest);

            try {
                r.open('POST', server, true, username, password);
                r.setRequestHeader('Content-Type', 'application/json');
                r.onerror = handleAJAXError;
                r.send(json);
            } catch (e) {
                logger.error('Unable to send cookies for "' + domain +
                    '" to server: ' + e.message);
            }

        }, SEND_INTERVAL, domain);
    };

    /**
     * Request updated cookies from the server
     * @param domain The domain to request an update for.
     * @param immediate If true, the request is executed immediately. If false,
     *        requests will be queued as normal.
     */
    var requestUpdate = function(domain, immediate) {
        // Get reference to cookie details
        let cookieObj = cookieDomains[domain];
        let server = cookieObj.server;
        let username = cookieObj.user;
        let password = cookieObj.pass;

        // Set request delay
        let delay = immediate ? 0 : CHECK_INTERVAL;

        // Call this function again with the same argument
        clearTimeout(cookieObj.requestTimer);
        cookieObj.requestTimer = setTimeout(function(domain) {

            logger.info('[' + domain + '] Requesting cookies from server.');
            let url = server + '?domain=' + domain;

            // Notify the server
            let r = Cc['@mozilla.org/xmlextras/xmlhttprequest;1']
                .createInstance(Ci.nsIXMLHttpRequest);
            try {
                r.open('GET', url, true, username, password);
                r.onload = function(event) {
                    handleServerCookies(event, domain);
                }
                r.onerror = handleAJAXError;
                r.send();
            } catch (e) {
                logger.error('Unable to get cookies for "' + domain +
                    '" from server: ' + e.message);
            }
        
        }, delay, domain);
    };

    /**
     * Callback for XMLHttpRequests requesting cookies from the server
     */
    var handleServerCookies = function(event, domain) {
        let text = event.target.responseText;
        let json = JSON.parse(text);

        // Don't overwrite shit when the server had nothing
        if (json.length == 0) {
            logger.info('Server has no data for ' + domain);
            requestUpdate(domain, false);
            return;
        }

        // Don't bounce all these cookies back to the server
        settingFlag = true;

        // Get reference to the cookie service
        let cookieMgr =  Services.cookies;

        logger.debug('[' + domain + '] Before update: ' + 
            cookieMgr.countCookiesFromHost(domain) + ' cookies.');

        requestUpdate(domain, false);

        logger.debug('[' + domain + '] Got data for ' +
            json.length + ' cookies from server.');

        // Now set the received cookies
        for (let i = 0; i < json.length; i += 1) {
            let cookie = json[i];

            cookieMgr.remove(
                cookie.host,
                cookie.name,
                cookie.path,
                false
            );

            cookieMgr.add(
                cookie.host,
                cookie.path,
                cookie.name,
                cookie.value,
                cookie.isSecure,
                cookie.isHttpOnly,
                cookie.isSession,
                cookie.expires
            );

            logger.trace('Received [' + cookie.host + ']: ' + cookie.name);
        }

        // Allow setting of cookies once more
        settingFlag = false;

        // Queue another go
        requestUpdate(domain, false);
    };

    /**
     * Get a JSON string representing the client's set of cookies for a given
     * domain
     * @param domain The domain to get a JSON string for
     */
    var getDomainJSON = function(domain) {
        // Get cookie manager
        let mgr = Services.cookies;

        // The JSON object to send to the server
        let send = {
            domain:  domain,
            cookies: [ ]
        };

        let enumerator = mgr.getCookiesFromHost(domain);
        while (enumerator.hasMoreElements()) {
            let c = enumerator.getNext().QueryInterface(Ci.nsICookie2);

            // Add this cookie to the object to send to the server
            send.cookies.push({
                host: c.host,
                path: c.path,
                name: c.name,
                value: c.value,
                isSecure: c.isSecure,
                isHttpOnly: c.isHttpOnly,
                isSession: c.isSession,
                expires: 1575781804 //c.expires // TODO: wtf
            });
        }

        return JSON.stringify(send);
    };

    var handleAJAXError = function(e) {
        logger.error("XMLHttpRequest failed: " + e.target.status);
    };

    /**
     * Update the set of domains that should have cookies synchronized.
     */
    var updateDomains = function() {

        /*
         * The database returns an array of objects, each in the following form:
         * {
         *     domain: '',
         *     server: '',
         *     user:   '',
         *     pass:   ''
         * }
         */
        IcingDatabase.getItems(function(domains) {
            // Add items to the master cookie list that aren't already there
            for (let i = 0; i < domains.length; i += 1) {
                let domain = domains[i].domain;
                let server = domains[i].server;
                let user   = domains[i].user;
                let pass   = domains[i].pass;

                if (!cookieDomains[domain]) {
                    cookieDomains[domain] = {
                        server:       server,
                        user:         user,
                        pass:         pass,
                        sendTimer:    null,
                        requestTimer: null
                    };

                    requestUpdate(domain, true);
                }
            }

            // Remove items from the master list that aren't in the db anymore
            for (j in cookieDomains) {
                let seen = false;
                for (let i = 0; i < domains.length; i += 1) {
                    if (j == domains[i].domain) {
                        seen = true;
                        break;
                    }
                }

                if (!seen) {
                    delete cookieDomains[j];
                }
            }
        });
    };

    // Self-initialize
    if (!initialized) {
        initService();
    }

    return {
        updateDomains: updateDomains
    };

})();
