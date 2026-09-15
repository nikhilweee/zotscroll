.DEFAULT_GOAL := help
.PHONY: *

help:                       ## Show this help
	@sed -ne '/@sed/!s/## //p' $(MAKEFILE_LIST)

pack:                       ## Pack XPI
	cd src && zip -r ../zotscroll.xpi *

debug:                      ## Run Zotero with Debugger
	/Applications/Zotero.app/Contents/MacOS/zotero \
	--debugger --purgecaches

profile:                    ## Run Zotero with Profile Manager
	/Applications/Zotero.app/Contents/MacOS/zotero \
	--ProfileManager
