Zotscroll = {
    notifierID: null,
    originalReaderOpen: null,
    attachedReaders: new Map(),

    start() {
        if (Array.isArray(Zotero.Reader?._readers)) {
            for (const reader of Zotero.Reader._readers) {
                this.attachToReader(reader);
            }
        }

        if (typeof Zotero.Reader?.open === "function") {
            const self = this;
            this.originalReaderOpen = Zotero.Reader.open;
            Zotero.Reader.open = async function (...args) {
                const reader = await self.originalReaderOpen.apply(this, args);
                if (reader) self.attachToReader(reader);
                return reader;
            };
        }

        this.notifierID = Zotero.Notifier.registerObserver(
            {
                notify: (event, type, ids) => {
                    if (type !== "tab") return;
                    for (const id of ids) {
                        if (event === "close") {
                            this.cleanupReaderByTabID(id);
                        } else {
                            const reader = Zotero.Reader?.getByTabID(id);
                            if (reader) this.attachToReader(reader);
                        }
                    }
                }
            },
            ["tab"],
            "zotscroll"
        );
    },

    async attachToReader(reader) {
        if (!reader || this.attachedReaders.has(reader)) return;

        try {
            await reader._initPromise;
        } catch (_) {
            return;
        }

        if (reader._type !== "pdf") return;

        const cleanups = [];
        this.attachedReaders.set(reader, cleanups);

        const attachView = async (view) => {
            if (!view) return;
            try {
                if (view.initializedPromise) await view.initializedPromise;
            } catch (_) {}

            const win = view._iframeWindow;
            const container = win?.document?.getElementById("viewerContainer");
            if (!container) return;

            cleanups.push(this.setupSmoothScroll(win, container));
        };

        const internal = reader._internalReader;
        if (internal?._primaryView) await attachView(internal._primaryView);
        if (internal?._secondaryView) await attachView(internal._secondaryView);

        if (reader._iframeWindow?.document) {
            const outerDoc = reader._iframeWindow.document;
            const getController = () =>
                reader._internalReader?._primaryView?._iframeWindow?.document
                    ?.getElementById("viewerContainer")?._zotscrollController;

            const outerKeyDown = (e) => {
                if (getController()?.handleKeyDown(e)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            const outerKeyUp = (e) => getController()?.handleKeyUp(e);
            const outerBlur = () => getController()?.handleBlur();

            outerDoc.addEventListener("keydown", outerKeyDown, true);
            outerDoc.addEventListener("keyup", outerKeyUp, true);
            reader._iframeWindow.addEventListener("blur", outerBlur);

            cleanups.push(() => {
                outerDoc.removeEventListener("keydown", outerKeyDown, true);
                outerDoc.removeEventListener("keyup", outerKeyUp, true);
                reader._iframeWindow.removeEventListener("blur", outerBlur);
            });
        }
    },

    setupSmoothScroll(win, container) {
        const pressedKeys = new Set();
        let pageTargetY = null;
        let isAnimating = false;
        let rafId = null;
        let lastTime = null;

        const scrollSpeed = 1000;
        const tapStep = 50;

        const onScroll = () => {
            if (!isAnimating) pageTargetY = null;
        };
        container.addEventListener("scroll", onScroll, { passive: true });

        const animate = (timestamp) => {
            if (!lastTime) lastTime = timestamp;
            const dt = Math.min(32, timestamp - lastTime) / 1000;
            lastTime = timestamp;

            const maxX = container.scrollWidth - container.clientWidth;
            const maxY = container.scrollHeight - container.clientHeight;
            const delta = scrollSpeed * dt;

            if (pressedKeys.has("j")) {
                pageTargetY = null;
                container.scrollTop = Math.min(maxY, container.scrollTop + delta);
            } else if (pressedKeys.has("k")) {
                pageTargetY = null;
                container.scrollTop = Math.max(0, container.scrollTop - delta);
            }

            if (pressedKeys.has("l")) {
                container.scrollLeft = Math.min(maxX, container.scrollLeft + delta);
            } else if (pressedKeys.has("h")) {
                container.scrollLeft = Math.max(0, container.scrollLeft - delta);
            }

            if (pageTargetY !== null) {
                const diffY = pageTargetY - container.scrollTop;
                if (Math.abs(diffY) < 1) {
                    container.scrollTop = pageTargetY;
                    pageTargetY = null;
                } else {
                    container.scrollTop += diffY * 0.25;
                }
            }

            if (pressedKeys.size > 0 || pageTargetY !== null) {
                rafId = win.requestAnimationFrame(animate);
            } else {
                isAnimating = false;
                lastTime = null;
                pageTargetY = null;
                rafId = null;
            }
        };

        const startAnimation = () => {
            if (!isAnimating) {
                isAnimating = true;
                lastTime = null;
                rafId = win.requestAnimationFrame(animate);
            }
        };

        const handleKeyDown = (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey || this.isEditable(e.target)) return false;

            const maxX = container.scrollWidth - container.clientWidth;
            const maxY = container.scrollHeight - container.clientHeight;

            switch (e.key) {
                case "j":
                    if (!pressedKeys.has("j")) container.scrollTop = Math.min(maxY, container.scrollTop + tapStep);
                    pressedKeys.add("j");
                    pressedKeys.delete("k");
                    startAnimation();
                    return true;
                case "k":
                    if (!pressedKeys.has("k")) container.scrollTop = Math.max(0, container.scrollTop - tapStep);
                    pressedKeys.add("k");
                    pressedKeys.delete("j");
                    startAnimation();
                    return true;
                case "h":
                    if (!pressedKeys.has("h")) container.scrollLeft = Math.max(0, container.scrollLeft - tapStep);
                    pressedKeys.add("h");
                    pressedKeys.delete("l");
                    startAnimation();
                    return true;
                case "l":
                    if (!pressedKeys.has("l")) container.scrollLeft = Math.min(maxX, container.scrollLeft + tapStep);
                    pressedKeys.add("l");
                    pressedKeys.delete("h");
                    startAnimation();
                    return true;
                case "d":
                    pageTargetY = Math.min(maxY, container.scrollTop + container.clientHeight * 0.5);
                    startAnimation();
                    return true;
                case "e":
                    pageTargetY = Math.max(0, container.scrollTop - container.clientHeight * 0.5);
                    startAnimation();
                    return true;
                default:
                    return false;
            }
        };

        const handleKeyUp = (e) => {
            pressedKeys.delete(e.key);
        };

        const handleBlur = () => {
            pressedKeys.clear();
        };

        const onKeyDown = (e) => {
            if (handleKeyDown(e)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        win.addEventListener("keydown", onKeyDown, true);
        win.addEventListener("keyup", handleKeyUp, true);
        win.addEventListener("blur", handleBlur);

        container._zotscrollController = { handleKeyDown, handleKeyUp, handleBlur };

        return () => {
            if (rafId) win.cancelAnimationFrame(rafId);
            container.removeEventListener("scroll", onScroll);
            win.removeEventListener("keydown", onKeyDown, true);
            win.removeEventListener("keyup", handleKeyUp, true);
            win.removeEventListener("blur", handleBlur);
            delete container._zotscrollController;
        };
    },

    isEditable(target) {
        if (!target) return false;
        const tag = target.tagName?.toLowerCase();
        return (
            tag === "input" ||
            tag === "textarea" ||
            tag === "select" ||
            target.isContentEditable ||
            Boolean(target.closest?.("[contenteditable='true'], input, textarea, select"))
        );
    },

    cleanupReader(reader) {
        const cleanups = this.attachedReaders.get(reader);
        if (cleanups) {
            cleanups.forEach((fn) => {
                try { fn(); } catch (_) {}
            });
            this.attachedReaders.delete(reader);
        }
    },

    cleanupReaderByTabID(tabID) {
        for (const [reader] of this.attachedReaders.entries()) {
            if (reader.tabID === tabID) {
                this.cleanupReader(reader);
                break;
            }
        }
    },

    shutdown() {
        if (this.notifierID) {
            Zotero.Notifier.unregisterObserver(this.notifierID);
            this.notifierID = null;
        }

        if (this.originalReaderOpen && Zotero.Reader) {
            Zotero.Reader.open = this.originalReaderOpen;
            this.originalReaderOpen = null;
        }

        for (const [reader] of this.attachedReaders.entries()) {
            this.cleanupReader(reader);
        }
        this.attachedReaders.clear();
    }
};
