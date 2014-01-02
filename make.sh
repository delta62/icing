#!/bin/bash
# Make script for icing plugin.
#
# Requires:
#   zip
#

# Remove old zip file
if [ -e icing.xpi ]; then
    rm icing.xpi
fi

# Make new zip file
zip -r icing.xpi chrome.manifest content install.rdf locale modules skin

# Copy zip file into appropriate folder
cp icing.xpi ~/.mozilla/firefox/oxgfckai.dev/extensions/{75362221-2706-4134-ae5f-5233e40952a2}.xpi

