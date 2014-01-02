var EXPORTED_SYMBOLS = ['IcingDatabase'];

// Import logging module
Components.utils.import('resource://icing/log4moz.jsm');

// Import icing logger
Components.utils.import('resource://icing/logging.jsm');

// Alias commonly used references
const { classes: Cc, interfaces: Ci } = Components;

// Abstract "private" variables with a closure
var IcingDatabase = (function() {

    /**
     * Whether or not the database service is currently servicing
     */
    var initialized = false;

    /**
     * Logging instance
     */
    var logger;

    /**
     * Raw connection handle. Always use initialize to get a reference to this,
     * as it will be guaranteed to be instantiated and only one connection will
     * be made.
     */
    var connection;

    /**
     * Returns a handle to the database instance (singleton pattern)
     */
    var initialize = function() {
        initialized = true;

        // Get logger instance
        logger = Log4Moz.repository.getLogger('Icing.DatabaseLogger');
        logger.level = Log4Moz.Level['Warn'];
        logger.info('Initialized icing database');

        Components.utils.import('resource://gre/modules/Services.jsm');
        Components.utils.import('resource://gre/modules/FileUtils.jsm');

        let file = FileUtils.getFile('ProfD', ['icing', 'icing.db']);
        connection = Services.storage.openDatabase(file);

        ensureInstalled();
    };

    /**
     * Ensure that the database is ready to use
     */
    var ensureInstalled = function() {
        if (!connection.tableExists('session_servers')) {
            // Install the database tables
            let statement = connection.createStatement(
               "CREATE TABLE session_servers ( \
                    uri    TEXT NOT NULL PRIMARY KEY, \
                    server TEXT NOT NULL, \
                    user   TEXT NOT NULL, \
                    pass   TEXT NOT NULL \
                );"
            );

            statement.executeAsync({
                handleError: function(error) {
                    logger.error('Error ensuring installation: ' + error);
                },

                handleCompletion: function(reason) {
                    let i = Ci.mozIStorageStatementCallback;
                    if (reason != i.REASON_FINISHED) {
                        logger.warn('Query cancelled or aborted while ' +
                            'ensuring db installation (reason: ' + reason +
                            ').');
                    }
                }
            });
        }
    };

    /**
     * Add or edit an entry for a session server / uri pair. Since everything is
     * based off of uris, just change existing uris if they're found to exist
     * already.
     */
    var editEntry = function(domain, server, user, pass, callback) {
        let statement = connection.createStatement(
           "SELECT COUNT(*) AS overwrite \
            FROM session_servers \
            WHERE uri = ?1"
        );

        statement.bindStringParameter(0, domain);

        statement.executeAsync({
            handleResult: function(results) {
                let row = results.getNextRow();
                if (row.getResultByName('overwrite')) {
                    updateDomain(domain, server, user, pass, callback);
                } else {
                    insertDomain(domain, server, user, pass, callback);
                }
            },

            handleError: function(error) {
                logger.error('Error while editing entry for "' + domain +
                    '": ' + error.message);
            },

            handleCompletion: function(reason) {
                let i = Ci.mozIStorageStatementCallback;
                if (reason != i.REASON_FINISHED) {
                    logger.warn('Query cancelled or aborted while ensuring ' +
                        'entry for ' + domain + ': ' + reason + ').');
                }
            }
        });
    };

    /**
     * Update an existing domain in the database
     */
    var updateDomain = function(domain, server, user, pass, callback) {
        let statement = connection.createStatement(
            "UPDATE session_servers \
             SET server = ?2, \
                user = ?3, \
                pass = ?4 \
             WHERE uri = ?1"
        );

        statement.bindStringParameter(0, domain);
        statement.bindStringParameter(1, server);
        statement.bindStringParameter(2, user);
        statement.bindStringParameter(3, pass)

        // Execute the statement. We don't care about the results.
        statement.executeAsync({
            handleError: function(error) {
                logger.error('Error while updating domain "' + domain + 
                    '": ' + error.message);
            },

            handleCompletion: function(reason) {
                let i = Components.interfaces.mozIStorageStatementCallback;
                if (reason != i.REASON_FINISHED) {
                    logger.warn('Query cancelled or aborted while updating ' +
                        'domain "' + domain + '": ' + reason);
                } else {
                    callback();
                }
            }
        });
    };

    /**
     * Create a new entry for a domain in the database
     */
    var insertDomain = function(domain, server, user, pass, callback) {
        let statement = connection.createStatement(
            "INSERT INTO session_servers (uri, server, user, pass) \
            VALUES (?1, ?2, ?3, ?4)"
        );

        statement.bindStringParameter(0, domain);
        statement.bindStringParameter(1, server);
        statement.bindStringParameter(2, user);
        statement.bindStringParameter(3, pass);

        // Execute the statement. We don't care about the results
        statement.executeAsync({
            handleError: function(error) {
                logger.error('Error while inserting domain "' + domain +
                    '": ' + error.message);
            },

            handleCompletion: function(reason) {
                let i = Components.interfaces.mozIStorageStatementCallback;
                if (reason != i.REASON_FINISHED) {
                    logger.warn('Query cancelled or aborted while adding ' +
                        'domain "' + domain + '": ' + reason);
                } else {
                    callback();
                }
            }
        });
    };

    /**
     * Get all of the server / uri entries, and pass them as a parameter to the
     * passed callback. The items will be sorted into an array of objects, with
     * each object containing keys for a uri, user, password, and the server it
     * maps to.
     */
    var getItems = function(callback) {
        let items = [ ];

        let statement = connection.createStatement(
           "SELECT uri, server, user, pass \
            FROM session_servers \
            ORDER BY uri"
        );

        statement.executeAsync({
            // Warning - not called when query returns no rows
            handleResult: function(rows) {
                while (row = rows.getNextRow()) {
                    items.push({
                        domain: row.getResultByName('uri'),
                        server: row.getResultByName('server'),
                        user:   row.getResultByName('user'),
                        pass:   row.getResultByName('pass')
                    });
                }
            },

            handleError: function(error) {
                logger.error('Error getting domains from DB: ' + e.message);
            },

            handleCompletion: function(reason) {
                let i = Ci.mozIStorageStatementCallback;
                if (reason != i.REASON_FINISHED) {
                    logger.warn('getItems query cancelled or aborted ' +
                        '(reason: ' + reason + ').');
                } else {
                    callback(items);
                }
            }
        });
    };

    /**
     * Get all the information for a single domain entry
     * @param domain The domain to query information for
     * @param callback A callback to be executed upon results. Called with one
     *        parameter, which is an object in the following format:
     *        {
     *            domain: '',
     *            server: '',
     *            user:   '',
     *            pass:   ''
     *        }
     */
    var getEntry = function(domain, callback) {
        let statement = connection.createStatement(
           "SELECT uri, server, user, pass \
            FROM session_servers \
            WHERE uri = ?1"
        );

        statement.bindStringParameter(0, domain);

        statement.executeAsync({
            handleResult: function(rows) {
                let row = rows.getNextRow();
                callback({
                    domain: row.getResultByName('uri'),
                    server: row.getResultByName('server'),
                    user: row.getResultByName('user'),
                    pass: row.getResultByName('pass')
                });
            },

            handleError: function(error) {
                logger.error('Error while querying domain "' + domain +
                    '": ' + error.message);
            },

            handleCompletion: function(reason) {
                let i = Ci.mozIStorageStatementCallback;
                if (reason != i.REASON_FINISHED) {
                    logger.warn('Query cancelled or aborted while querying ' +
                        'for "' + domain + '": ' + reason);
                }
            }
        });
    }

    /**
     * Remove an entry from the database
     */
    var removeEntry = function(domain, callback) {
        let statement = connection.createStatement(
           "DELETE FROM  session_servers \
            WHERE uri = ?1"
        );

        statement.bindStringParameter(0, domain);

        statement.executeAsync({
            handleError: function(error) {
                logger.error('Error while removing entry for "' + domain +
                    '": ' + error.message);
            },

            handleCompletion: function(reason) {
                let i = Ci.mozIStorageStatementCallback;
                if (reason != i.REASON_FINISHED) {
                    logger.warn('Query cancelled or aborted while removing ' +
                        'entry for "' + domain + '": ' + reason);
                } else {
                    callback();
                }
            }
        })
    };

    // Self-initialize
    if (!initialized) {
        initialize();
    }

    // Expose public API
    return {
        update: editEntry,
        getItems: getItems,
        getItem: getEntry,
        removeItem: removeEntry
    };

})();
