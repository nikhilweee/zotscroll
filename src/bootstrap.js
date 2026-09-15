var Zotscroll;

async function startup({ resourceURI, rootURI }) {
    await Zotero.initializationPromise;
    Services.scriptloader.loadSubScript((rootURI || resourceURI?.spec) + "zotscroll.js");
    Zotscroll.start();
}

function shutdown(data, reason) {
    if (reason === APP_SHUTDOWN) return;
    Zotscroll?.shutdown();
    Zotscroll = undefined;
}
