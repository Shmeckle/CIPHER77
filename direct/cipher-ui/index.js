(() => {
    const { patcher, metro, ui, logger } = vendetta;
    const { React, ReactNative } = metro.common;
    const {
        StyleSheet,
        View,
        Text,
        ScrollView,
        Switch,
        Pressable,
    } = ReactNative;

    const store = vendetta.plugin.storage;
    const unpatches = [];
    const undo = [];
    let styleCache = new WeakMap();

    const C = Object.freeze({
        BLACK: "#000000",
        DEEP: "#080407",
        PLUM: "#170D16",
        PLUM2: "#100910",
        RED: "#FF003C",
        CYAN: "#02D7F2",
        CYAN_BRIGHT: "#72EAF8",
        CYAN_SOFT: "#B8F8FC",
        CYAN_MUTED: "#78BFC7",
        CYAN_DARK: "#3A7C84",
        YELLOW: "#F3E600",
        GREEN: "#47D58B",
    });

    const RADIUS_KEYS = [
        "borderRadius",
        "borderTopLeftRadius", "borderTopRightRadius",
        "borderBottomLeftRadius", "borderBottomRightRadius",
        "borderTopStartRadius", "borderTopEndRadius",
        "borderBottomStartRadius", "borderBottomEndRadius",
        "borderStartStartRadius", "borderStartEndRadius",
        "borderEndStartRadius", "borderEndEndRadius",
    ];

    const STYLE_PROPS = [
        "style", "containerStyle", "contentContainerStyle",
        "wrapperStyle", "imageStyle", "maskStyle",
    ];

    const ROUND_FLAGS = [
        "isRound", "circle", "isCircular", "circular",
        "rounded", "roundAsCircle",
    ];

    const BRAND_HEX = new Set([
        "#5865f2", "#4752c4", "#5b6eae", "#7983f5",
        "#5865f299", "#5865f2ff"
    ]);

    const MONTH_RE = /^(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{1,2})?(?:,?\s+\d{4})?$/i;

    const stats = {
        registryObjects: 0,
        registryMutations: 0,
        elements: 0,
        styles: 0,
        selected: 0,
        inputs: 0,
        headers: 0,
        dates: 0,
        jsxRuntimes: 0,
        nativePayloads: 0,
    };

    function initStore() {
        store.enabled ??= true;
        store.paletteFallback ??= true;
        store.hudBorders ??= true;
        store.squareUI ??= true;
        store.selectedAccent ??= true;
        store.headerLines ??= true;
        store.dateYellow ??= true;
        store.brandToHUD ??= true;
    }

    function normalHex(value) {
        if (typeof value !== "string") return null;
        let v = value.trim().toLowerCase();
        if (!v.startsWith("#")) return null;
        v = v.slice(1);
        if (v.length === 3 || v.length === 4) {
            v = v.split("").map(x => x + x).join("");
        }
        if (v.length !== 6 && v.length !== 8) return null;
        if (!/^[0-9a-f]+$/.test(v)) return null;
        return "#" + v;
    }

    function rgbaParts(value) {
        const hex = normalHex(value);
        if (!hex) return null;
        return {
            hex,
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16),
            a: hex.length === 9 ? hex.slice(7, 9) : "",
        };
    }

    function withAlpha(hex, alpha) {
        return alpha ? hex + alpha.toUpperCase() : hex;
    }

    function neutral(c, tolerance = 24) {
        return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) <= tolerance;
    }

    function avg(c) {
        return (c.r + c.g + c.b) / 3;
    }

    function isBrand(value) {
        const hex = normalHex(value);
        return hex ? BRAND_HEX.has(hex) : false;
    }

    function rewriteBackground(value) {
        if (!store.enabled || !store.paletteFallback) return value;
        if (store.brandToHUD && isBrand(value)) return C.PLUM;

        const c = rgbaParts(value);
        if (!c || !neutral(c, 20)) return value;

        const n = avg(c);
        if (n <= 58) return withAlpha(C.BLACK, c.a);
        if (n <= 100) return withAlpha(C.PLUM2, c.a);
        return value;
    }

    function rewriteText(value) {
        if (!store.enabled || !store.paletteFallback) return value;
        const c = rgbaParts(value);
        if (!c || !neutral(c, 28)) return value;

        const n = avg(c);
        if (n >= 175) return withAlpha(C.CYAN_SOFT, c.a);
        if (n >= 95) return withAlpha(C.CYAN_MUTED, c.a);
        return value;
    }

    function rewriteTint(value) {
        if (!store.enabled || !store.paletteFallback) return value;
        const c = rgbaParts(value);
        if (!c || !neutral(c, 28)) return value;
        if (avg(c) >= 95) return withAlpha(C.CYAN, c.a);
        return value;
    }

    function rewriteBorder(value) {
        if (!store.enabled || !store.hudBorders) return value;
        const c = rgbaParts(value);
        if (!c) return value;
        if (neutral(c, 34)) return withAlpha(C.RED, c.a);
        return value;
    }

    function typeName(type) {
        if (typeof type === "string") return type;
        if (typeof type === "function") return type.displayName || type.name || "anonymous";
        if (type && typeof type === "object") {
            return type.displayName || (type.render && type.render.name) || "component";
        }
        return String(type);
    }

    function originalRadius(style) {
        if (!style || typeof style !== "object") return null;
        try {
            const flat = StyleSheet.flatten(style);
            if (!flat || typeof flat !== "object") return null;
            for (const key of RADIUS_KEYS) {
                if (typeof flat[key] === "number") return flat[key];
            }
        } catch {}
        return null;
    }

    function shouldKeepTinyCircle(style) {
        let flat;
        try { flat = StyleSheet.flatten(style); } catch { return false; }
        if (!flat) return false;
        const w = flat.width;
        const h = flat.height;
        return (
            typeof w === "number" && typeof h === "number" &&
            w <= 18 && h <= 18
        );
    }

    function transformStyle(style, meta = {}) {
        if (!store.enabled || !style || typeof style !== "object") return style;

        const cached = styleCache.get(style);
        if (cached && !meta.selected && !meta.input && !meta.header && !meta.avatar) {
            return cached;
        }

        if (Array.isArray(style)) {
            let changed = false;
            const out = style.map(item => {
                const next = transformStyle(item, meta);
                if (next !== item) changed = true;
                return next;
            });
            const result = changed ? out : style;
            if (!meta.selected && !meta.input && !meta.header && !meta.avatar) {
                styleCache.set(style, result);
            }
            return result;
        }

        let next = null;
        const edit = () => (next ??= Object.assign({}, style));

        if ("backgroundColor" in style) {
            const v = rewriteBackground(style.backgroundColor);
            if (v !== style.backgroundColor) edit().backgroundColor = v;

            if (store.brandToHUD && isBrand(style.backgroundColor)) {
                const e = edit();
                e.backgroundColor = C.PLUM;
                e.borderColor = C.RED;
                e.borderWidth = Math.max(1, Number(style.borderWidth) || 0);
            }
        }

        if ("color" in style) {
            const v = rewriteText(style.color);
            if (v !== style.color) edit().color = v;
        }

        if ("tintColor" in style) {
            const v = rewriteTint(style.tintColor);
            if (v !== style.tintColor) edit().tintColor = v;
        }

        for (const key of [
            "borderColor", "borderTopColor", "borderRightColor",
            "borderBottomColor", "borderLeftColor",
            "borderStartColor", "borderEndColor"
        ]) {
            if (!(key in style)) continue;
            const v = rewriteBorder(style[key]);
            if (v !== style[key]) edit()[key] = v;
        }

        if (store.squareUI) {
            const keepCircle = shouldKeepTinyCircle(style);
            for (const key of RADIUS_KEYS) {
                const v = style[key];
                if (typeof v === "number" && v > 5 && !keepCircle) {
                    edit()[key] = 5;
                } else if (typeof v === "string" && v.endsWith("%") && !keepCircle) {
                    edit()[key] = 5;
                }
            }
        }

        if (meta.input) {
            Object.assign(edit(), {
                backgroundColor: C.PLUM2,
                borderColor: C.RED,
                borderWidth: 1,
                borderRadius: 5,
                color: C.CYAN_SOFT,
            });
        }

        if (meta.selected && store.selectedAccent) {
            Object.assign(edit(), {
                backgroundColor: C.PLUM,
                borderLeftWidth: 3,
                borderLeftColor: C.YELLOW,
                borderBottomWidth: 1,
                borderBottomColor: C.RED,
                borderRadius: 3,
            });
        }

        if (meta.header && store.headerLines) {
            Object.assign(edit(), {
                backgroundColor: C.BLACK,
                borderBottomWidth: 1,
                borderBottomColor: C.RED,
            });
        }

        if (meta.avatar && store.hudBorders) {
            const r = originalRadius(style);
            if (r != null && r >= 12) {
                Object.assign(edit(), {
                    borderColor: C.RED,
                    borderWidth: Math.max(1, Number(style.borderWidth) || 0),
                });
            }
        }

        const result = next || style;
        if (!meta.selected && !meta.input && !meta.header && !meta.avatar) {
            styleCache.set(style, result);
        }
        return result;
    }

    function isSelected(props) {
        return !!(
            props &&
            (
                props.selected === true ||
                props.isSelected === true ||
                props.channelSelected === true ||
                props.accessibilityState?.selected === true
            )
        );
    }

    function isHeader(name, props) {
        if (!props) return false;
        if (props.accessibilityRole === "header") return true;
        if (/^(?:.*(?:Top|Nav|Channel|Guild|Profile)Header.*)$/i.test(name)) return true;
        return false;
    }

    function isInput(name, type) {
        return (
            type === ReactNative.TextInput ||
            /TextInput|InputField|SearchInput|MessageInput/i.test(name)
        );
    }

    function isImage(name, type) {
        return type === ReactNative.Image || /Avatar|Image|GuildIcon/i.test(name);
    }

    function looksDate(children) {
        if (!store.dateYellow || typeof children !== "string") return false;
        const t = children.trim();
        if (MONTH_RE.test(t)) return true;
        return /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(t);
    }

    function transformProps(type, props) {
        if (!store.enabled || !props || typeof props !== "object") return props;
        stats.elements++;

        const name = typeName(type);
        const selected = isSelected(props);
        const input = isInput(name, type);
        const header = isHeader(name, props);
        const avatar = isImage(name, type);

        let next = props;
        const edit = () => {
            if (next === props) next = Object.assign({}, props);
            return next;
        };

        for (const key of STYLE_PROPS) {
            const value = props[key];
            if (!value || typeof value !== "object") continue;
            const out = transformStyle(value, {
                selected: key === "style" && selected,
                input: key === "style" && input,
                header: key === "style" && header,
                avatar: key === "style" && avatar,
            });
            if (out !== value) {
                edit()[key] = out;
                stats.styles++;
            }
        }

        if (input) {
            const e = edit();
            e.placeholderTextColor = C.CYAN_MUTED;
            e.selectionColor = C.YELLOW;
            e.cursorColor = C.RED;
            if (e.isRound === true) e.isRound = false;
            stats.inputs++;
        }

        if (selected) stats.selected++;
        if (header) stats.headers++;

        if (store.squareUI) {
            for (const key of ROUND_FLAGS) {
                if (props[key] === true) edit()[key] = false;
            }

            for (const key of ["borderRadius", "cornerRadius", "sheetCornerRadius"]) {
                const v = props[key];
                if (typeof v === "number" && v > 5) edit()[key] = 5;
            }
        }

        // Native-style colors sometimes arrive as direct props instead of style.
        for (const [key, fn] of [
            ["backgroundColor", rewriteBackground],
            ["color", rewriteText],
            ["tintColor", rewriteTint],
            ["borderColor", rewriteBorder],
        ]) {
            if (!(key in props)) continue;
            const v = fn(props[key]);
            if (v !== props[key]) edit()[key] = v;
        }

        // Date separator text gets the hazard-yellow accent used on desktop.
        if ((type === Text || name === "Text" || /Text/i.test(name)) && looksDate(props.children)) {
            edit().style = [
                props.style,
                { color: C.YELLOW, fontWeight: "700" }
            ];
            stats.dates++;
        }

        return next;
    }

    function mutateObject(obj, key, value) {
        try {
            obj[key] = value;
            undo.push([obj, key, value]);
            stats.registryMutations++;
        } catch {}
    }

    function patchExistingObject(obj, seen, depth = 0) {
        if (!obj || typeof obj !== "object" || depth > 5 || seen.has(obj)) return;
        seen.add(obj);
        stats.registryObjects++;

        let keys;
        try { keys = Object.keys(obj); } catch { return; }

        for (const key of keys) {
            let value;
            try { value = obj[key]; } catch { continue; }

            let next = value;

            if (key === "backgroundColor") next = rewriteBackground(value);
            else if (key === "color") next = rewriteText(value);
            else if (key === "tintColor") next = rewriteTint(value);
            else if (
                key === "borderColor" ||
                key === "borderTopColor" ||
                key === "borderBottomColor" ||
                key === "borderLeftColor" ||
                key === "borderRightColor"
            ) next = rewriteBorder(value);
            else if (store.squareUI && RADIUS_KEYS.includes(key)) {
                if (typeof value === "number" && value > 5) next = 5;
                else if (typeof value === "string" && value.endsWith("%")) next = 5;
            }

            if (next !== value) {
                try {
                    undo.push([obj, key, value]);
                    obj[key] = next;
                    stats.registryMutations++;
                    continue;
                } catch {}
            }

            if (value && typeof value === "object") {
                patchExistingObject(value, seen, depth + 1);
            }
        }
    }

    function sweepRegistry() {
        if (!store.enabled) return;
        const seen = new WeakSet();
        const modules = metro.modules;
        let count = 0;

        for (const id in modules) {
            if (count > 250000) break;
            const mod = modules[id];
            if (!mod || !mod.isInitialized || mod.hasError) continue;

            let exports;
            try { exports = mod.publicModule?.exports; } catch { continue; }
            if (!exports || exports === globalThis) continue;

            patchExistingObject(exports, seen, 0);
            count++;
        }
    }

    function patchStyleSheetCreate() {
        if (!StyleSheet || typeof StyleSheet.create !== "function") return;
        unpatches.push(
            patcher.instead("create", StyleSheet, (args, original) => {
                try {
                    const input = args[0];
                    if (input && typeof input === "object") {
                        const copy = {};
                        for (const [name, style] of Object.entries(input)) {
                            copy[name] = transformStyle(style);
                        }
                        args[0] = copy;
                    }
                } catch {}
                return original(...args);
            })
        );
    }

    function patchElementFactories() {
        const rewrite = args => {
            try {
                const props = transformProps(args[0], args[1]);
                if (props !== args[1]) args[1] = props;
            } catch (e) {
                logger?.warn?.("[CIPHER] element transform failed", e);
            }
            return args;
        };

        const patched = new Map();

        for (const method of ["jsx", "jsxs", "jsxDEV"]) {
            let mods = [];
            try { mods = metro.findByPropsAll(method) || []; } catch {}

            for (const mod of mods) {
                if (!mod || typeof mod[method] !== "function") continue;

                let names = patched.get(mod);
                if (!names) {
                    names = new Set();
                    patched.set(mod, names);
                }
                if (names.has(method)) continue;
                names.add(method);

                unpatches.push(
                    patcher.instead(method, mod, (args, original) => original(...rewrite(args)))
                );
            }
        }

        stats.jsxRuntimes = patched.size;

        if (React && typeof React.createElement === "function") {
            unpatches.push(
                patcher.instead("createElement", React, (args, original) => original(...rewrite(args)))
            );
        }
    }

    function patchNativePayload() {
        let candidates = [];
        try { candidates = metro.findByPropsAll("create", "diff") || []; } catch {}

        const seen = new Set();
        for (const mod of candidates) {
            if (!mod || seen.has(mod)) continue;
            seen.add(mod);

            if (
                typeof mod.create !== "function" ||
                typeof mod.diff !== "function" ||
                mod.create.length !== 2 ||
                mod.diff.length !== 3
            ) continue;

            const sanitize = props => {
                try { return transformProps("nativeProps", props); }
                catch { return props; }
            };

            unpatches.push(
                patcher.instead("create", mod, (args, original) => {
                    args[0] = sanitize(args[0]);
                    return original(...args);
                })
            );
            unpatches.push(
                patcher.instead("diff", mod, (args, original) => {
                    args[0] = sanitize(args[0]);
                    args[1] = sanitize(args[1]);
                    return original(...args);
                })
            );

            stats.nativePayloads++;
        }
    }

    function restoreRegistry() {
        for (let i = undo.length - 1; i >= 0; i--) {
            const [obj, key, original] = undo[i];
            try { obj[key] = original; } catch {}
        }
        undo.length = 0;
    }

    function resetCaches() {
        styleCache = new WeakMap();
    }

    function start() {
        initStore();
        resetCaches();

        // Existing + future style coverage.
        sweepRegistry();
        patchStyleSheetCreate();
        patchElementFactories();
        patchNativePayload();

        logger?.info?.(
            `[CIPHER] 0.2 active; mutations=${stats.registryMutations}, jsx=${stats.jsxRuntimes}, native=${stats.nativePayloads}`
        );
    }

    function stop() {
        for (const unpatch of unpatches.splice(0).reverse()) {
            try { unpatch(); } catch {}
        }
        restoreRegistry();
        resetCaches();
        logger?.info?.("[CIPHER] 0.2 stopped");
    }

    function Toggle({ label, keyName }) {
        return React.createElement(
            View,
            {
                style: {
                    minHeight: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottomWidth: 1,
                    borderBottomColor: "#FF003C55",
                    paddingVertical: 8,
                },
            },
            React.createElement(
                Text,
                { style: { color: C.CYAN_SOFT, flex: 1, fontSize: 15 } },
                label
            ),
            React.createElement(Switch, {
                value: !!store[keyName],
                onValueChange: value => {
                    store[keyName] = value;
                    resetCaches();
                },
                trackColor: { false: "#29262D", true: C.RED },
                thumbColor: store[keyName] ? C.YELLOW : C.CYAN_SOFT,
            })
        );
    }

    function Settings() {
        initStore();
        vendetta.storage.useProxy(store);

        const card = {
            backgroundColor: C.BLACK,
            borderColor: C.RED,
            borderWidth: 1,
            borderRadius: 5,
            paddingHorizontal: 12,
            marginBottom: 12,
        };

        return React.createElement(
            ScrollView,
            {
                contentContainerStyle: {
                    backgroundColor: C.BLACK,
                    padding: 14,
                    paddingBottom: 40,
                },
            },
            React.createElement(
                View,
                { style: card },
                React.createElement(
                    Text,
                    {
                        style: {
                            color: C.YELLOW,
                            fontSize: 20,
                            fontWeight: "800",
                            paddingTop: 10,
                        },
                    },
                    "CIPHER // 2077"
                ),
                React.createElement(
                    Text,
                    {
                        style: {
                            color: C.CYAN_MUTED,
                            fontSize: 12,
                            lineHeight: 17,
                            paddingVertical: 8,
                        },
                    },
                    "HUD geometry layer. Theme handles most colours; this layer catches Discord surfaces and shapes that ignore theme tokens."
                )
            ),
            React.createElement(
                View,
                { style: card },
                React.createElement(Toggle, { label: "Runtime styling", keyName: "enabled" }),
                React.createElement(Toggle, { label: "Neutral → CIPHER palette fallback", keyName: "paletteFallback" }),
                React.createElement(Toggle, { label: "Neon-red HUD borders", keyName: "hudBorders" }),
                React.createElement(Toggle, { label: "5px Cyberpunk corners", keyName: "squareUI" }),
                React.createElement(Toggle, { label: "Yellow selected-row accent", keyName: "selectedAccent" }),
                React.createElement(Toggle, { label: "Red header divider lines", keyName: "headerLines" }),
                React.createElement(Toggle, { label: "Hazard-yellow date separators", keyName: "dateYellow" }),
                React.createElement(Toggle, { label: "Convert Discord blurple buttons to HUD panels", keyName: "brandToHUD" })
            ),
            React.createElement(
                View,
                { style: card },
                React.createElement(
                    Text,
                    { style: { color: C.RED, fontWeight: "700", paddingTop: 10 } },
                    "DIAGNOSTICS"
                ),
                React.createElement(
                    Text,
                    {
                        style: {
                            color: C.CYAN_MUTED,
                            fontSize: 11,
                            lineHeight: 17,
                            paddingVertical: 8,
                        },
                    },
                    `registry objects ${stats.registryObjects}\n` +
                    `registry mutations ${stats.registryMutations}\n` +
                    `elements ${stats.elements} • styles ${stats.styles}\n` +
                    `selected ${stats.selected} • inputs ${stats.inputs}\n` +
                    `headers ${stats.headers} • dates ${stats.dates}\n` +
                    `jsx runtimes ${stats.jsxRuntimes} • native payload modules ${stats.nativePayloads}`
                )
            )
        );
    }

    return {
        onLoad: start,
        onUnload: stop,
        settings: Settings,
    };
})()