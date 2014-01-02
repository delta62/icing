var EXPORTED_SYMBOLS = ['IcingLogger'];

// Import logging module
Components.utils.import('resource://icing/log4moz.jsm');

const { classes: Cc, interfaces: Ci } = Components;

var IcingLogger = (function() {

    var initialized = false;

    var STR_PAD_LEFT = 1;
    var STR_PAD_RIGHT = 2;
    var STR_PAD_BOTH = 3;

    /**
     * Initialize the logging interface
     */
    var initLogging = function() {
        let formatter = new Log4Moz.BasicFormatter();
        let root = Log4Moz.repository.rootLogger;
        let logFile = getLocalDirectory();
        let appender;

        // Append to logfile
        logFile.append('log.txt');
        root.level = Log4Moz.Level['All'];

        appender = new Log4Moz.RotatingFileAppender(logFile, formatter);
        appender.level = Log4Moz.Level['All'];
        root.addAppender(appender);

        // Append to stdout
        let dapp = new Log4Moz.DumpAppender(formatter);
        dapp.level = Log4Moz.Level['All'];
        root.addAppender(dapp);
    };

    var getLocalDirectory = function() {
        let directoryService = Cc["@mozilla.org/file/directory_service;1"].
            getService(Ci.nsIProperties);
        let localDir = directoryService.get("ProfD", Ci.nsIFile);

        localDir.append("icing");

        if (!localDir.exists() || !localDir.isDirectory()) {
            // read and write permissions to owner and group, read-only for others.
            localDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0774);
        }

        return localDir;
    };

    var printHeader = function() {
        let output = '';

        output += 'Secure ';
        output += 'HTTP Only ';
        output += 'Session ';
        output += 'Host              ';
        output += 'Path        ';
        output += 'Name        ';
        output += 'Value                   ';
        output += 'Expires   ';

        dump(output + '\n');
    };

    /**
     * Print a cookie all nice-like
     */
    var printCookie = function(c) {
        let output = '';
        if (c.isSecure) {
            output += pad('[x]', 7, ' ', STR_PAD_BOTH);
        } else {
            output += pad('[ ]', 7, ' ', STR_PAD_BOTH);
        }

        if (c.isHttpOnly) {
            output += pad('[x]', 10, ' ', STR_PAD_BOTH);
        } else {
            output += pad('[ ]', 10, ' ', STR_PAD_BOTH);
        }

        if (c.isSession) {
            output += pad('[x]', 8, ' ', STR_PAD_BOTH);
        } else {
            output += pad('[ ]', 8, ' ', STR_PAD_BOTH);
        }

        output += pad(maxLen(c.host, 17), 18, ' ', STR_PAD_RIGHT);
        output += pad(maxLen(c.path, 11), 12, ' ', STR_PAD_RIGHT);
        output += pad(maxLen(c.name, 11), 12, ' ', STR_PAD_RIGHT);
        output += pad(maxLen(c.value, 23), 24, ' ', STR_PAD_RIGHT);
        output += pad(maxLen(c.expires, 9), 10, ' ', STR_PAD_RIGHT);

        dump(output + '\n');
    };

    var pad = function(str, len, pad, dir) {
        if (typeof(len) == "undefined") { var len = 0; }
        if (typeof(pad) == "undefined") { var pad = ' '; }
        if (typeof(dir) == "undefined") { var dir = STR_PAD_RIGHT; }

        if (len + 1 >= str.length) {
            switch (dir){
                case STR_PAD_LEFT:
                    str = Array(len + 1 - str.length).join(pad) + str;
                break;
                case STR_PAD_BOTH:
                    var right = Math.ceil((padlen = len - str.length) / 2);
                    var left = padlen - right;
                    str = Array(left+1).join(pad) + str + Array(right+1).join(pad);
                break;
                default:
                    str = str + Array(len + 1 - str.length).join(pad);
                break;
            } // switch
        }
        return str;
    };

    var maxLen = function(str, maxlen) {
        if (str.length > maxlen) {
            return str.substr(0, maxlen);
        }

        return str;
    };

    if (!initialized) {
        initLogging();
    }

    return {
        printCookie: printCookie,
        printHeader: printHeader
    };

})();
