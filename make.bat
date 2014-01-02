@ECHO OFF

DEL icing.xpi
winrar a -afzip icing.xpi content locale skin modules chrome.manifest install.rdf
COPY icing.xpi C:\Users\Sam\AppData\Roaming\Mozilla\Firefox\Profiles\xhdu976e.development\extensions\{75362221-2706-4134-ae5f-5233e40952a2}.xpi
