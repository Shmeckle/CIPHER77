globalThis.plugin = (() => {
    "use strict";

    const isSpec3 = typeof definePlugin === "function";
    const revenge = typeof bunny !== "undefined" ? bunny : globalThis.bunny;
    const legacy = typeof vendetta !== "undefined" ? vendetta : null;

    const React = legacy?.metro?.common?.React || revenge?.metro?.common?.React || globalThis.React;
    const RN = legacy?.metro?.common?.ReactNative || revenge?.metro?.common?.ReactNative || globalThis.ReactNative;
    const metro = isSpec3 ? revenge?.metro : legacy?.metro;
    const patcher = isSpec3 ? revenge?.api?.patcher : legacy?.patcher;
    const logger = isSpec3 ? revenge?.plugin?.logger : legacy?.logger;

    if (!React || !RN || !metro || !patcher) {
        throw new Error("CIPHER // 2077 UI: Revenge runtime APIs were not found.");
    }

    const store = isSpec3 ? revenge.plugin.createStorage() : legacy.plugin.storage;
    const useStorage = isSpec3
        ? () => revenge.api.storage.useObservable([store])
        : () => legacy.storage.useProxy(store);

    const { View, Text, ScrollView, Switch, Pressable } = RN;

    const C = Object.freeze({
        BLACK: "#000000",
        PLUM: "#170D16",
        DEEP_PLUM: "#100910",
        RED: "#FF003C",
        CYAN: "#02D7F2",
        CYAN_BRIGHT: "#72EAF8",
        CYAN_SOFT: "#B8F8FC",
        CYAN_MUTED: "#78BFC7",
        YELLOW: "#F3E600",
        GREEN: "#47D58B"
    });

    const stats = {
        elements: 0,
        nativePayloads: 0,
        dcdChat: 0,
        text: 0,
        inputs: 0,
        selectedRows: 0,
        hooks: []
    };

    const unpatches = [];
    let styleCache = new WeakMap();

    function initStore() {
        store.enabled ??= true;
        store.oledSurfaces ??= true;
        store.cyanNeutralText ??= true;
        store.hudBorders ??= true;
        store.squareCorners ??= true;
        store.selectionAccent ??= true;
    }

    function typeName(type) {
        if (typeof type === "string") return type;
        if (typeof type === "function") return type.displayName || type.name || "";
        if (type && typeof type === "object") {
            return type.displayName || typeName(type.type) || typeName(type.render) || "";
        }
        return "";
    }

    function parseHex(value) {
        if (typeof value !== "string") return null;
        let v = value.trim();
        if (!v.startsWith("#")) return null;
        v = v.slice(1);
        if (v.length === 3) v = v.split("").map(x => x + x).join("");
        if (v.length !== 6 && v.length !== 8) return null;
        const rgb = v.slice(0, 6);
        if (!/^[0-9a-f]{6}$/i.test(rgb)) return null;
        return [
            parseInt(rgb.slice(0, 2), 16),
            parseInt(rgb.slice(2, 4), 16),
            parseInt(rgb.slice(4, 6), 16),
            v.length === 8 ? v.slice(6, 8) : ""
        ];
    }

    function withAlpha(hex, alpha) {
        return alpha ? hex + alpha : hex;
    }

    function neutral(rgb, spread = 22) {
        const [r, g, b] = rgb;
        return Math.max(r, g, b) - Math.min(r, g, b) <= spread;
    }

    function rewriteBackground(value) {
        if (!store.enabled || !store.oledSurfaces) return value;
        const rgb = parseHex(value);
        if (!rgb || !neutral(rgb, 16)) return value;
        const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
        if (avg <= 48) return withAlpha(C.BLACK, rgb[3]);
        if (avg <= 78) return withAlpha(C.PLUM, rgb[3]);
        return value;
    }

    function rewriteText(value) {
        if (!store.enabled || !store.cyanNeutralText) return value;
        const rgb = parseHex(value);
        if (!rgb || !neutral(rgb, 24)) return value;
        const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
        if (avg >= 185) return withAlpha(C.CYAN_SOFT, rgb[3]);
        if (avg >= 105) return withAlpha(C.CYAN_MUTED, rgb[3]);
        return value;
    }

    function rewriteTint(value) {
        if (!store.enabled) return value;
        const rgb = parseHex(value);
        if (!rgb || !neutral(rgb, 24)) return value;
        const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
        if (avg >= 110) return withAlpha(C.CYAN, rgb[3]);
        return value;
    }

    function transformStyle(style) {
        if (!style || typeof style !== "object") return style;

        const cached = styleCache.get(style);
        if (cached !== undefined) return cached;

        if (Array.isArray(style)) {
            let changed = false;
            const next = style.map(entry => {
                const out = transformStyle(entry);
                if (out !== entry) changed = true;
                return out;
            });
            const result = changed ? next : style;
            styleCache.set(style, result);
            return result;
        }

        let next = null;
        const edit = () => (next ??= Object.assign({}, style));

        if ("backgroundColor" in style) {
            const v = rewriteBackground(style.backgroundColor);
            if (v !== style.backgroundColor) edit().backgroundColor = v;
        }
        if ("color" in style) {
            const v = rewriteText(style.color);
            if (v !== style.color) edit().color = v;
        }
        if ("tintColor" in style) {
            const v = rewriteTint(style.tintColor);
            if (v !== style.tintColor) edit().tintColor = v;
        }

        if (store.enabled && store.squareCorners) {
            for (const key of [
                "borderRadius",
                "borderTopLeftRadius", "borderTopRightRadius",
                "borderBottomLeftRadius", "borderBottomRightRadius",
                "borderTopStartRadius", "borderTopEndRadius",
                "borderBottomStartRadius", "borderBottomEndRadius"
            ]) {
                const v = style[key];
                if (typeof v === "number" && v > 4 && v < 100) edit()[key] = 4;
            }
        }

        if (store.enabled && store.hudBorders) {
            const bw = style.borderWidth;
            const bc = style.borderColor;
            if (typeof bw === "number" && bw > 0 && bc) {
                const rgb = parseHex(bc);
                if (rgb && neutral(rgb, 24)) edit().borderColor = C.RED;
            }
        }

        const result = next || style;
        styleCache.set(style, result);
        return result;
    }

    function mergeStyle(props, extra, type) {
        const base = props || {};
        const pieces = [transformStyle(base.style), extra].filter(Boolean);
        if (typeof type === "string" && RN.StyleSheet?.flatten) {
            return { ...base, style: RN.StyleSheet.flatten(pieces) };
        }
        return { ...base, style: pieces };
    }

    function textish(type, props, name) {
        if (!props || props.children === undefined) return false;
        if (name === "RCTText" || name === "Text") return true;
        // Discord's design-system Text is often anonymous but exposes variant.
        if (typeof type === "object" && props.variant !== undefined) return true;
        return false;
    }

    function inputish(name) {
        return /TextInput|InputFieldContainer|RCT.*TextInput|AndroidTextInput/i.test(name);
    }

    function selectedRow(name, props) {
        if (!store.selectionAccent || !props) return false;
        const selected = props.channelSelected === true || props.isSelected === true || props.selected === true;
        return selected && /Channel|Row|ListItem|Guild/i.test(name);
    }

    function transformElementArgs(args) {
        if (!store.enabled || !args?.length) return args;

        const type = args[0];
        const props = args[1];
        if (!props || typeof props !== "object") return args;

        stats.elements++;
        const name = typeName(type);
        let nextProps = props;
        let changed = false;

        const setProps = value => {
            nextProps = value;
            changed = true;
        };

        // First rewrite any styles Discord already supplied.
        const transformed = transformStyle(props.style);
        if (transformed !== props.style) {
            setProps({ ...nextProps, style: transformed });
        }

        // DCDChat is Discord's native message-list host. We cannot reach each
        // message's native internals from JS, but we can force the host surface.
        if (/DCDChat/i.test(name)) {
            stats.dcdChat++;
            setProps({
                ...nextProps,
                backgroundColor: C.BLACK,
                style: RN.StyleSheet?.flatten
                    ? RN.StyleSheet.flatten([nextProps.style, { backgroundColor: C.BLACK }])
                    : [nextProps.style, { backgroundColor: C.BLACK }]
            });
        }

        // Neutral text becomes the soft cyan of the desktop Cyberpunk theme.
        // Role/user colours survive because only neutral greys/whites are rewritten.
        if (textish(type, nextProps, name)) {
            stats.text++;
            const extra = { color: C.CYAN_SOFT };
            setProps(mergeStyle(nextProps, extra, type));

            if (/Category|SectionHeader/i.test(name)) {
                setProps(mergeStyle(nextProps, { color: C.RED }, type));
            }
        }

        if (inputish(name)) {
            stats.inputs++;
            setProps({
                ...mergeStyle(nextProps, {
                    color: C.CYAN_SOFT,
                    backgroundColor: C.DEEP_PLUM,
                    borderColor: C.RED,
                    borderWidth: 1,
                    borderRadius: 4
                }, type),
                placeholderTextColor: C.CYAN_MUTED,
                isRound: false
            });
        }

        if (selectedRow(name, nextProps)) {
            stats.selectedRows++;
            setProps(mergeStyle(nextProps, {
                backgroundColor: C.PLUM,
                borderLeftWidth: 3,
                borderLeftColor: C.YELLOW,
                borderBottomWidth: 1,
                borderBottomColor: C.RED,
                borderRadius: 2
            }, type));
        }

        // Known shape flags used by Discord UI components. Preserve actual
        // avatars/circles; only flatten fields/panels.
        if (store.squareCorners && nextProps.isRound === true && !/Avatar/i.test(name)) {
            setProps({ ...nextProps, isRound: false });
        }

        return changed ? [type, nextProps, ...args.slice(2)] : args;
    }

    function installElementHooks() {
        const before = (method, parent) => {
            if (!parent || typeof parent[method] !== "function") return;
            const un = patcher.before(method, parent, args => {
                try {
                    return transformElementArgs(args);
                } catch (e) {
                    logger?.warn?.(`[CIPHER] ${method} transform failed`, e);
                }
            });
            if (typeof un === "function") unpatches.push(un);
            stats.hooks.push(method);
        };

        before("createElement", React);

        const seen = new Set();
        const all = typeof metro.findByPropsAll === "function"
            ? metro.findByPropsAll.bind(metro)
            : null;

        for (const method of ["jsx", "jsxs", "jsxDEV"]) {
            let modules = [];
            try {
                if (all) modules = all(method) || [];
                else {
                    const one = metro.findByProps?.(method);
                    if (one) modules = [one];
                }
            } catch {}

            for (const mod of modules) {
                if (!mod || seen.has(`${method}:${String(mod)}`) || typeof mod[method] !== "function") continue;
                before(method, mod);
            }
        }
    }

    function transformNativeProps(props) {
        if (!store.enabled || !props || typeof props !== "object") return props;
        stats.nativePayloads++;

        let next = props;
        const edit = () => {
            if (next === props) next = { ...props };
            return next;
        };

        if (props.style) {
            const out = transformStyle(props.style);
            if (out !== props.style) edit().style = out;
        }

        if ("backgroundColor" in props) {
            const out = rewriteBackground(props.backgroundColor);
            if (out !== props.backgroundColor) edit().backgroundColor = out;
        }
        if ("color" in props) {
            const out = rewriteText(props.color);
            if (out !== props.color) edit().color = out;
        }
        if ("tintColor" in props) {
            const out = rewriteTint(props.tintColor);
            if (out !== props.tintColor) edit().tintColor = out;
        }

        return next;
    }

    function installNativePayloadHooks() {
        let candidates = [];
        try {
            candidates = typeof metro.findByPropsAll === "function"
                ? (metro.findByPropsAll("create", "diff") || [])
                : [metro.findByProps?.("create", "diff")].filter(Boolean);
        } catch {
            return;
        }

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

            const u1 = patcher.instead("create", mod, (args, original) => {
                try { args[0] = transformNativeProps(args[0]); } catch {}
                return original(...args);
            });
            const u2 = patcher.instead("diff", mod, (args, original) => {
                try {
                    args[0] = transformNativeProps(args[0]);
                    args[1] = transformNativeProps(args[1]);
                } catch {}
                return original(...args);
            });

            if (typeof u1 === "function") unpatches.push(u1);
            if (typeof u2 === "function") unpatches.push(u2);
            stats.hooks.push("nativeProps");
        }
    }

    function resetCaches() {
        styleCache = new WeakMap();
    }

    function start() {
        initStore();
        resetCaches();
        installElementHooks();
        installNativePayloadHooks();
        logger?.info?.(
            `[CIPHER] UI 0.1.0 active. hooks=${stats.hooks.join(",") || "none"}`
        );
    }

    function stop() {
        for (const un of unpatches.splice(0).reverse()) {
            try { un(); } catch {}
        }
        resetCaches();
        logger?.info?.("[CIPHER] UI stopped");
    }

    function ToggleRow({ label, value, onChange }) {
        return React.createElement(View, {
            style: {
                minHeight: 46,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottomWidth: 1,
                borderBottomColor: "#FF003C55"
            }
        },
            React.createElement(Text, {
                style: { color: C.CYAN_SOFT, fontSize: 15, fontWeight: "600", flex: 1 }
            }, label),
            React.createElement(Switch, {
                value,
                onValueChange: value => {
                    onChange(value);
                    resetCaches();
                },
                trackColor: { false: "#3A3A3F", true: C.RED },
                thumbColor: value ? C.YELLOW : "#B8F8FC"
            })
        );
    }

    function Settings() {
        useStorage();
        initStore();

        const card = {
            backgroundColor: C.BLACK,
            borderWidth: 1,
            borderColor: C.RED,
            borderRadius: 4,
            paddingHorizontal: 12,
            paddingVertical: 6,
            marginBottom: 12
        };

        return React.createElement(ScrollView, {
            contentContainerStyle: {
                padding: 14,
                paddingBottom: 40,
                backgroundColor: C.BLACK
            }
        },
            React.createElement(View, { style: card },
                React.createElement(Text, {
                    style: { color: C.YELLOW, fontSize: 19, fontWeight: "800", marginVertical: 8 }
                }, "CIPHER // 2077"),
                React.createElement(Text, {
                    style: { color: C.CYAN_MUTED, fontSize: 12, marginBottom: 8, lineHeight: 17 }
                }, "Runtime styling layer. Theme handles palette; this plugin attacks React Native surfaces the colour map cannot reach.")
            ),
            React.createElement(View, { style: card },
                React.createElement(ToggleRow, {
                    label: "Runtime styling",
                    value: store.enabled,
                    onChange: v => store.enabled = v
                }),
                React.createElement(ToggleRow, {
                    label: "OLED-black neutral surfaces",
                    value: store.oledSurfaces,
                    onChange: v => store.oledSurfaces = v
                }),
                React.createElement(ToggleRow, {
                    label: "Soft-cyan neutral text",
                    value: store.cyanNeutralText,
                    onChange: v => store.cyanNeutralText = v
                }),
                React.createElement(ToggleRow, {
                    label: "Neon-red HUD borders",
                    value: store.hudBorders,
                    onChange: v => store.hudBorders = v
                }),
                React.createElement(ToggleRow, {
                    label: "Reduce rounded corners",
                    value: store.squareCorners,
                    onChange: v => store.squareCorners = v
                }),
                React.createElement(ToggleRow, {
                    label: "Yellow selected-row accent",
                    value: store.selectionAccent,
                    onChange: v => store.selectionAccent = v
                })
            ),
            React.createElement(View, { style: card },
                React.createElement(Text, {
                    style: { color: C.RED, fontSize: 13, fontWeight: "700", marginVertical: 7 }
                }, "RUNTIME COUNTERS"),
                React.createElement(Text, {
                    style: { color: C.CYAN_MUTED, fontSize: 11, lineHeight: 17 }
                },
                    `elements ${stats.elements}  •  native ${stats.nativePayloads}\n` +
                    `DCDChat ${stats.dcdChat}  •  text ${stats.text}  •  inputs ${stats.inputs}\n` +
                    `selected rows ${stats.selectedRows}\n` +
                    `hooks ${stats.hooks.join(", ") || "none"}`
                ),
                React.createElement(Text, {
                    style: { color: C.CYAN_MUTED, fontSize: 10, marginTop: 8, lineHeight: 15 }
                }, "After changing options, leave and re-enter the screen or reload Discord so already-mounted native views render again.")
            )
        );
    }

    const lifecycle = {
        start,
        stop,
        SettingsComponent: Settings
    };

    if (isSpec3) return definePlugin(lifecycle);

    return {
        onLoad: start,
        onUnload: stop,
        settings: Settings
    };
})();