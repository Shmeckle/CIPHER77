globalThis.plugin = (() => {
  "use strict";

  const revenge = typeof bunny !== "undefined" ? bunny : globalThis.bunny;
  const legacy = typeof vendetta !== "undefined" ? vendetta : null;

  const React = legacy?.metro?.common?.React || revenge?.metro?.common?.React || globalThis.React;
  const RN = legacy?.metro?.common?.ReactNative || revenge?.metro?.common?.ReactNative || globalThis.ReactNative;
  const metro = legacy?.metro || revenge?.metro;
  const patcher = legacy?.patcher || revenge?.api?.patcher;
  const logger = legacy?.logger || revenge?.plugin?.logger;

  if (!React || !RN || !metro || !patcher) throw new Error("CIPHER // 2077 UI: Revenge runtime APIs not found.");

  const C = {
    BLACK: "#000000",
    PLUM: "#170D16",
    DEEP_PLUM: "#100910",
    RED: "#FF003C",
    CYAN: "#02D7F2",
    CYAN_SOFT: "#B8F8FC",
    CYAN_MUTED: "#78BFC7",
    YELLOW: "#F3E600"
  };

  const unpatches = [];
  let styleCache = new WeakMap();
  const DATE_RE = /^(?:\\d{1,2}\\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\\s+\\d{1,2})?(?:,?\\s+\\d{4})?$/i;

  function typeName(type) {
    if (typeof type === "string") return type;
    if (typeof type === "function") return type.displayName || type.name || "";
    if (type && typeof type === "object") return type.displayName || typeName(type.type) || typeName(type.render) || "";
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

  function neutral(rgb, spread = 22) {
    return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) <= spread;
  }

  function avg(rgb) {
    return (rgb[0] + rgb[1] + rgb[2]) / 3;
  }

  function withAlpha(hex, a) {
    return a ? hex + a : hex;
  }

  function rewriteBackground(value) {
    const rgb = parseHex(value);
    if (!rgb) return value;

    const raw = value.toLowerCase();
    if (raw.startsWith("#5865f2") || raw.startsWith("#4752c4")) return C.PLUM;
    if (!neutral(rgb, 18)) return value;

    const x = avg(rgb);
    if (x <= 50) return withAlpha(C.BLACK, rgb[3]);
    if (x <= 90) return withAlpha(C.PLUM, rgb[3]);
    return value;
  }

  function rewriteText(value) {
    const rgb = parseHex(value);
    if (!rgb || !neutral(rgb, 24)) return value;

    const x = avg(rgb);
    if (x >= 185) return withAlpha(C.CYAN_SOFT, rgb[3]);
    if (x >= 105) return withAlpha(C.CYAN_MUTED, rgb[3]);
    return value;
  }

  function transformStyle(style, name = "") {
    if (!style || typeof style !== "object") return style;
    const cached = styleCache.get(style);
    if (cached !== undefined) return cached;

    if (Array.isArray(style)) {
      let changed = false;
      const out = style.map(item => {
        const next = transformStyle(item, name);
        if (next !== item) changed = true;
        return next;
      });
      const result = changed ? out : style;
      styleCache.set(style, result);
      return result;
    }

    let next = null;
    const edit = () => (next ??= { ...style });

    if ("backgroundColor" in style) {
      const v = rewriteBackground(style.backgroundColor);
      if (v !== style.backgroundColor) edit().backgroundColor = v;
    }

    if ("color" in style) {
      const v = rewriteText(style.color);
      if (v !== style.color) edit().color = v;
    }

    if (/Header|TopBar|NavBar/i.test(name)) {
      Object.assign(edit(), {
        backgroundColor: C.BLACK,
        borderBottomWidth: 1,
        borderBottomColor: C.RED
      });
    }

    if (!/Avatar|Status|Badge/i.test(name)) {
      for (const key of [
        "borderRadius",
        "borderTopLeftRadius", "borderTopRightRadius",
        "borderBottomLeftRadius", "borderBottomRightRadius"
      ]) {
        const v = style[key];
        if (typeof v === "number" && v > 6 && v < 100) edit()[key] = 5;
      }
    }

    const result = next || style;
    styleCache.set(style, result);
    return result;
  }

  function isSelected(name, props) {
    const selected =
      props?.channelSelected === true ||
      props?.isSelected === true ||
      props?.selected === true ||
      props?.accessibilityState?.selected === true;
    return selected && /Channel|Row|ListItem|Guild/i.test(name);
  }

  function transformElementArgs(args) {
    if (!args?.length) return args;
    const type = args[0];
    const props = args[1];
    if (!props || typeof props !== "object") return args;

    const name = typeName(type);
    let nextProps = props;
    let changed = false;
    const setProps = value => {
      nextProps = value;
      changed = true;
    };

    const transformed = transformStyle(props.style, name);
    if (transformed !== props.style) setProps({ ...nextProps, style: transformed });

    if (/DCDChat/i.test(name)) {
      setProps({
        ...nextProps,
        backgroundColor: C.BLACK,
        style: [nextProps.style, { backgroundColor: C.BLACK }]
      });
    }

    const isText = name === "RCTText" || name === "Text" || (typeof type === "object" && nextProps.variant !== undefined);
    if (isText && typeof nextProps.children === "string" && DATE_RE.test(nextProps.children.trim())) {
      setProps({
        ...nextProps,
        style: [nextProps.style, { color: C.YELLOW, fontWeight: "700" }]
      });
    }

    if (/TextInput|InputFieldContainer|SearchInput|MessageInput/i.test(name)) {
      setProps({
        ...nextProps,
        style: [
          nextProps.style,
          {
            color: C.CYAN_SOFT,
            backgroundColor: C.DEEP_PLUM,
            borderColor: C.RED,
            borderWidth: 1,
            borderRadius: 5
          }
        ],
        placeholderTextColor: C.CYAN_MUTED,
        selectionColor: C.YELLOW,
        cursorColor: C.RED,
        isRound: false
      });
    }

    if (isSelected(name, nextProps)) {
      setProps({
        ...nextProps,
        style: [
          nextProps.style,
          {
            backgroundColor: C.PLUM,
            borderLeftWidth: 3,
            borderLeftColor: C.YELLOW,
            borderBottomWidth: 1,
            borderBottomColor: C.RED,
            borderRadius: 3
          }
        ]
      });
    }

    return changed ? [type, nextProps, ...args.slice(2)] : args;
  }

  function installHooks() {
    const patch = (method, parent) => {
      if (!parent || typeof parent[method] !== "function") return;
      const un = patcher.before(method, parent, args => {
        try { return transformElementArgs(args); }
        catch (e) { logger?.warn?.(`[CIPHER] ${method} transform failed`, e); }
      });
      if (typeof un === "function") unpatches.push(un);
    };

    patch("createElement", React);

    const all = typeof metro.findByPropsAll === "function" ? metro.findByPropsAll.bind(metro) : null;
    for (const method of ["jsx", "jsxs", "jsxDEV"]) {
      let mods = [];
      try {
        if (all) mods = all(method) || [];
        else {
          const one = metro.findByProps?.(method);
          if (one) mods = [one];
        }
      } catch {}

      for (const mod of mods) {
        if (mod && typeof mod[method] === "function") patch(method, mod);
      }
    }
  }

  function start() {
    styleCache = new WeakMap();
    installHooks();
    logger?.info?.("[CIPHER] SAFE v0.2.1 active");
  }

  function stop() {
    for (const un of unpatches.splice(0).reverse()) {
      try { un(); } catch {}
    }
    styleCache = new WeakMap();
  }

  return { onLoad: start, onUnload: stop };
})();