var Zotscroll;

async function startup({ resourceURI, rootURI }) {
    await Zotero.initializationPromise;
    const baseURI = rootURI || resourceURI?.spec;

    Services.scriptloader.loadSubScript(baseURI + "zotscroll.js");
    Zotscroll.start();

    Zotero.PreferencePanes.register({
        pluginID: "zotscroll@nikhilweee.me",
        id: "zotscroll-preferences",
        label: "Zotscroll",
        image: baseURI + "icon.svg",
        src: baseURI + "preferences.xhtml",
        scripts: [baseURI + "preferences.js"]
    });
}

function shutdown(data, reason) {
    if (reason === APP_SHUTDOWN) return;
    Zotscroll?.shutdown();
    Zotscroll = undefined;
}
