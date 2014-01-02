if (typeof(Icing) == 'undefined') {
    var Icing = { };
}

// Acquire db connection
Components.utils.import('resource://icing/database.jsm');

// Get reference to the cookie service
Components.utils.import('resource://icing/cookies.jsm');

Icing.Domains = (function() {

    /**
     * Initialize the dialog window
     */
    var initDialog = function() {
        // Add event listeners...
        let list = document.getElementById('icing-domain-listbox');
        list.addEventListener('select', listSelect);

        let addButton = document.getElementById('icing-domain-add');
        addButton.addEventListener('command', addItem);

        let editButton = document.getElementById('icing-domain-edit');
        editButton.addEventListener('command', editItem);

        let deleteButton = document.getElementById('icing-domain-remove');
        deleteButton.addEventListener('command', removeItem);

        // Initialize list
        reloadData();
    };

    var listSelect = function(e) {
        let editBtn = document.getElementById('icing-domain-edit');
        editBtn.disabled = false;

        let deleteButton = document.getElementById('icing-domain-remove');
        deleteButton.disabled = false;
    };

    /**
     * Abstracts XUL's shitty interface for retrieving items from a listbox, and
     * returns an object with the properties "domain" and "server", which
     * correspond to the currently selected item. If nothing is selected, null
     * is returned.
     */
    var getItem = function() {
        let list = document.getElementById('icing-domain-listbox');
        if (list.selectedItem == null) {
            return null;
        }

        let columns = list.selectedItem.getElementsByTagName('listcell');
        return {
            domain: columns[0].getAttribute('label'),
            server: columns[1].getAttribute('label')
        }
    };

    var addItem = function() {
        Icing.DomainEntry.newEntry(function() {
            reloadData();
        });
    };

    var editItem = function() {
        let item = getItem();
        IcingDatabase.getItem(item.domain, function(info) {
            Icing.DomainEntry.editEntry(
                info.domain,
                info.server,
                info.user,
                info.pass,
                reloadData
            );
        });
    };

    var removeItem = function() {
        let domain = getItem().domain;
        IcingDatabase.removeItem(domain, function() {
            reloadData();
        });
    };

    /**
     * Clear the listbox of any elements and re-load them from the database
     */
    var reloadData = function() {
        IcingDatabase.getItems(function(items) {
            let list = document.getElementById('icing-domain-listbox');

            // Clear all existing items
            while (list.itemCount > 0) {
                list.removeItemAt(0);
            }

            // Populate list with current items
            for (let i = 0; i < items.length; i += 1) {
                let row = document.createElement('listitem');
                let cell = document.createElement('listcell');
                
                cell.setAttribute('label', items[i].domain);
                row.appendChild(cell);

                cell = document.createElement('listcell');
                cell.setAttribute('label', items[i].server);
                row.appendChild(cell);

                list.appendChild(row);
            }

            // Since selections have been cleared, disable edit/remove buttons
            document.getElementById('icing-domain-remove').disabled = true;
            document.getElementById('icing-domain-edit').disabled = true;

            window.sizeToContent();

            // Tell the cookie service that the sync'd domains have been updated
            IcingCookies.updateDomains(items);
        });
    };

    /**
     * Show the domain/server management dialog
     */
    var showDialog = function() {
        let features = 'chrome,titlebar,toolbar,centerscreen';
        let dialog = window.openDialog(
            'chrome://icing/content/domains.xul',
            'icing-domain-dialog', features
        );
    };

    // Expose public interface
    return {
        initialize: initDialog,
        showDialog: showDialog
    }

})();
