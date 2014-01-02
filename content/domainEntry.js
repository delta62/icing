if (typeof(Icing) == 'undefined') {
    var Icing = { };
}

// Acquire db connection
Components.utils.import('resource://icing/database.jsm');

Icing.DomainEntry = (function() {

    var initDialog = function() {
        window.addEventListener('dialogaccept', acceptDialog);

        let args = window.arguments[0];
        if (args.domain) {
            let domain = document.getElementById('icing-domain');
            domain.value = args.domain;
            domain.disabled = true;
        }
        if (args.server) {
            let server = document.getElementById('icing-server');
            server.value = args.server;
        }
        if (args.user) {
            let user = document.getElementById('icing-username');
            user.value = args.user;
        }
        if (args.pass) {
            let pass = document.getElementById('icing-password');
            pass.value = args.pass;
        }
    };

    /**
     * Show the add/edit domain window. Pass the domain and server
     * that are being edited. If this is anew item, leave domain and server out.
     */
    var showEditDialog = function(domain, server, user, pass, callback) {
        let features = 'chrome,titlebar,toolbar,centerscreen,modal';
        let dialog = window.openDialog(
            'chrome://icing/content/domainEntry.xul',
            'icing-server-edit', features,
            {
                domain: domain,
                server: server,
                user: user,
                pass: pass,
                callback: callback
            }
        );
    };

    var showAddDialog = function(callback) {
        let features = 'chrome,titlebar,toolbar,centerscreen,modal';
        let dialog = window.openDialog(
            'chrome://icing/content/domainEntry.xul',
            'icing-server-edit', features,
            { callback: callback }
        );
    };

    var acceptDialog = function(callback) {
        let domain = document.getElementById('icing-domain').value;
        let server = document.getElementById('icing-server').value;
        let user = document.getElementById('icing-username').value;
        let pass = document.getElementById('icing-password').value;
        let args = window.arguments[0];

        if (domain && server) {
            IcingDatabase.update(domain, server, user, pass, args.callback);
        }
    };

    // Expose public API
    return {
        initialize: initDialog,
        newEntry:   showAddDialog,
        editEntry:  showEditDialog
    }

})();
