Zotscroll = {
    DEFAULT_SHORTCUTS: {
        scrollDown: "j",
        scrollUp: "k",
        scrollLeft: "h",
        scrollRight: "l",
        halfPageDown: "d",
        halfPageUp: "e"
    },

    shortcuts: null,
    notifierID: null,
    prefObserverSymbol: null,
    originalReaderOpen: null,
    attachedReaders: new Map(),

    loadShortcuts() {
        try {
            const raw = Zotero.Prefs.get("zotscroll.shortcuts");
            this.shortcuts = raw
                ? Object.assign({}, this.DEFAULT_SHORTCUTS, JSON.parse(raw))
                : Object.assign({}, this.DEFAULT_SHORTCUTS);
        } catch (_) {
            this.shortcuts = Object.assign({}, this.DEFAULT_SHORTCUTS);
        }
    },

    start() {
        this.loadShortcuts();
        this.prefObserverSymbol = Zotero.Prefs.registerObserver("zotscroll.shortcuts", () => {
            this.loadShortcuts();
        });

        Zotero.Zotscroll = this;

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

    formatKey(key) {
        switch (key) {
            case "ArrowUp": return "↑ (ArrowUp)";
            case "ArrowDown": return "↓ (ArrowDown)";
            case "ArrowLeft": return "← (ArrowLeft)";
            case "ArrowRight": return "→ (ArrowRight)";
            default: return key;
        }
    },

    initPreferences(win) {
        const doc = win?.document || document;
        const shortcuts = this.shortcuts || this.DEFAULT_SHORTCUTS;

        const commands = [
            "scrollDown",
            "scrollUp",
            "scrollLeft",
            "scrollRight",
            "halfPageDown",
            "halfPageUp"
        ];

        for (const cmd of commands) {
            const input = doc.getElementById(`zotscroll-pref-${cmd}`);
            if (!input) continue;

            input.value = this.formatKey(shortcuts[cmd]);

            if (input._zotscrollBound) continue;
            input._zotscrollBound = true;

            input.addEventListener("keydown", (e) => {
                let key = null;
                if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                    key = e.key;
                } else if (/^[a-zA-Z]$/.test(e.key)) {
                    key = e.key.toLowerCase();
                }

                if (key) {
                    e.preventDefault();
                    e.stopPropagation();

                    this.shortcuts[cmd] = key;
                    Zotero.Prefs.set("zotscroll.shortcuts", JSON.stringify(this.shortcuts));

                    input.value = this.formatKey(key);
                    input.blur();
                } else if (e.key === "Tab" || e.key === "Escape") {
                    // Normal tab navigation
                } else {
                    e.preventDefault();
                }
            });
        }
    },

    resetDefaults(win) {
        const doc = win?.document || document;
        this.shortcuts = Object.assign({}, this.DEFAULT_SHORTCUTS);
        Zotero.Prefs.set("zotscroll.shortcuts", JSON.stringify(this.shortcuts));

        const commands = [
            "scrollDown",
            "scrollUp",
            "scrollLeft",
            "scrollRight",
            "halfPageDown",
            "halfPageUp"
        ];

        for (const cmd of commands) {
            const input = doc.getElementById(`zotscroll-pref-${cmd}`);
            if (input) {
                input.value = this.formatKey(this.DEFAULT_SHORTCUTS[cmd]);
            }
        }
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
        if (typeof container._zotscrollCleanup === "function") {
            try { container._zotscrollCleanup(); } catch (_) {}
        }

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
            // Clamp dt to 100ms to preserve velocity through PDF canvas rendering frame drops
            const dt = Math.min(100, timestamp - lastTime) / 1000;
            lastTime = timestamp;

            const maxX = container.scrollWidth - container.clientWidth;
            const maxY = container.scrollHeight - container.clientHeight;
            const delta = scrollSpeed * dt;
            const sc = Zotero?.Zotscroll?.shortcuts || this.shortcuts || this.DEFAULT_SHORTCUTS;

            if (pressedKeys.has(sc.scrollDown)) {
                pageTargetY = null;
                container.scrollTop = Math.min(maxY, container.scrollTop + delta);
            } else if (pressedKeys.has(sc.scrollUp)) {
                pageTargetY = null;
                container.scrollTop = Math.max(0, container.scrollTop - delta);
            }

            if (pressedKeys.has(sc.scrollRight)) {
                container.scrollLeft = Math.min(maxX, container.scrollLeft + delta);
            } else if (pressedKeys.has(sc.scrollLeft)) {
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

            const sc = Zotero?.Zotscroll?.shortcuts || this.shortcuts || this.DEFAULT_SHORTCUTS;
            const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

            const maxX = container.scrollWidth - container.clientWidth;
            const maxY = container.scrollHeight - container.clientHeight;

            if (key === sc.scrollDown) {
                if (!pressedKeys.has(key)) container.scrollTop = Math.min(maxY, container.scrollTop + tapStep);
                pressedKeys.add(key);
                pressedKeys.delete(sc.scrollUp);
                startAnimation();
                return true;
            }
            if (key === sc.scrollUp) {
                if (!pressedKeys.has(key)) container.scrollTop = Math.max(0, container.scrollTop - tapStep);
                pressedKeys.add(key);
                pressedKeys.delete(sc.scrollDown);
                startAnimation();
                return true;
            }
            if (key === sc.scrollLeft) {
                if (!pressedKeys.has(key)) container.scrollLeft = Math.max(0, container.scrollLeft - tapStep);
                pressedKeys.add(key);
                pressedKeys.delete(sc.scrollRight);
                startAnimation();
                return true;
            }
            if (key === sc.scrollRight) {
                if (!pressedKeys.has(key)) container.scrollLeft = Math.min(maxX, container.scrollLeft + tapStep);
                pressedKeys.add(key);
                pressedKeys.delete(sc.scrollLeft);
                startAnimation();
                return true;
            }
            if (key === sc.halfPageDown) {
                pageTargetY = Math.min(maxY, container.scrollTop + container.clientHeight * 0.5);
                startAnimation();
                return true;
            }
            if (key === sc.halfPageUp) {
                pageTargetY = Math.max(0, container.scrollTop - container.clientHeight * 0.5);
                startAnimation();
                return true;
            }
            return false;
        };

        const handleKeyUp = (e) => {
            const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            pressedKeys.delete(key);
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

        const cleanup = () => {
            if (rafId) win.cancelAnimationFrame(rafId);
            container.removeEventListener("scroll", onScroll);
            win.removeEventListener("keydown", onKeyDown, true);
            win.removeEventListener("keyup", handleKeyUp, true);
            win.removeEventListener("blur", handleBlur);
            delete container._zotscrollController;
            delete container._zotscrollCleanup;
        };
        container._zotscrollCleanup = cleanup;
        return cleanup;
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
        if (this.prefObserverSymbol) {
            Zotero.Prefs.unregisterObserver(this.prefObserverSymbol);
            this.prefObserverSymbol = null;
        }

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
        delete Zotero.Zotscroll;
    }
};
