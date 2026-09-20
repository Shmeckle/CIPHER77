import { ReactNative } from '@revenge-mod/react'
import { beforeJSX } from '@revenge-mod/react/jsx-runtime'

const C = Object.freeze({
    black: '#000000',
    plum: '#170D16',
    deepPlum: '#100910',
    red: '#FF003C',
    cyan: '#02D7F2',
    brightCyan: '#72EAF8',
    softCyan: '#B8F8FC',
    mutedCyan: '#78BFC7',
    yellow: '#F3E600',
    green: '#47D58B',
})

const unpatches = []
const SS = ReactNative.StyleSheet

function parseHex(value) {
    if (typeof value !== 'string') return null
    let v = value.trim()
    if (!v.startsWith('#')) return null

    v = v.slice(1)
    if (v.length === 3 || v.length === 4) {
        v = v.split('').map(ch => ch + ch).join('')
    }
    if (v.length !== 6 && v.length !== 8) return null
    if (!/^[0-9a-f]+$/i.test(v)) return null

    return {
        r: Number.parseInt(v.slice(0, 2), 16),
        g: Number.parseInt(v.slice(2, 4), 16),
        b: Number.parseInt(v.slice(4, 6), 16),
        a: v.length === 8 ? v.slice(6, 8) : '',
    }
}

function neutral(c, tolerance = 24) {
    return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) <= tolerance
}

function average(c) {
    return (c.r + c.g + c.b) / 3
}

function alpha(hex, a) {
    return a ? `${hex}${a}` : hex
}

function rewriteBackground(value) {
    const c = parseHex(value)
    if (!c || !neutral(c, 18)) return value

    const luma = average(c)
    if (luma <= 62) return alpha(C.black, c.a)
    if (luma <= 96) return alpha(C.plum, c.a)
    return value
}

function rewriteText(value) {
    const c = parseHex(value)
    if (!c || !neutral(c, 26)) return value

    const luma = average(c)
    if (luma >= 170) return alpha(C.softCyan, c.a)
    if (luma >= 90) return alpha(C.mutedCyan, c.a)
    return value
}

function rewriteTint(value) {
    const c = parseHex(value)
    if (!c || !neutral(c, 26)) return value

    if (average(c) >= 90) return alpha(C.cyan, c.a)
    return value
}

function rewriteBorder(value) {
    const c = parseHex(value)
    if (!c || !neutral(c, 30)) return value
    return alpha(C.red, c.a)
}

function flatten(style) {
    try {
        return SS.flatten(style)
    } catch {
        return null
    }
}

function isSelected(props) {
    return (
        props?.selected === true ||
        props?.isSelected === true ||
        props?.channelSelected === true ||
        props?.accessibilityState?.selected === true
    )
}

function stylePatch(style, options = {}) {
    if (typeof style === 'function') {
        return state => stylePatch(style(state), options)
    }

    const flat = flatten(style) || {}
    const patch = {}

    if (options.surface && flat.backgroundColor != null) {
        const next = rewriteBackground(flat.backgroundColor)
        if (next !== flat.backgroundColor) patch.backgroundColor = next
    }

    if (options.text) {
        if (flat.color == null) {
            patch.color = C.softCyan
        } else {
            const next = rewriteText(flat.color)
            if (next !== flat.color) patch.color = next
        }
    }

    if (options.icon && flat.tintColor != null) {
        const next = rewriteTint(flat.tintColor)
        if (next !== flat.tintColor) patch.tintColor = next
    }

    for (const key of [
        'borderColor',
        'borderTopColor',
        'borderRightColor',
        'borderBottomColor',
        'borderLeftColor',
        'borderStartColor',
        'borderEndColor',
    ]) {
        if (flat[key] == null) continue
        const next = rewriteBorder(flat[key])
        if (next !== flat[key]) patch[key] = next
    }

    for (const key of [
        'borderRadius',
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomLeftRadius',
        'borderBottomRightRadius',
        'borderTopStartRadius',
        'borderTopEndRadius',
        'borderBottomStartRadius',
        'borderBottomEndRadius',
    ]) {
        const value = flat[key]
        // Keep truly circular UI such as avatars/status dots circular.
        if (typeof value === 'number' && value > 6 && value < 100) patch[key] = 4
    }

    if (options.selected) {
        patch.backgroundColor = C.plum
        patch.borderLeftWidth = 3
        patch.borderLeftColor = C.yellow
        patch.borderBottomWidth = 1
        patch.borderBottomColor = C.red
        patch.borderRadius = 2
    }

    if (options.input) {
        patch.backgroundColor = C.deepPlum
        patch.color = C.softCyan
        patch.borderWidth = 1
        patch.borderColor = C.red
        patch.borderRadius = 4
    }

    return Object.keys(patch).length ? [style, patch] : style
}

function hook(type, transform) {
    if (!type) return

    const unpatch = beforeJSX(type, args => {
        try {
            const [element, props, key] = args
            if (!props) return args
            return [element, transform(props), key]
        } catch (error) {
            console.warn('[CIPHER // 2077] JSX transform failed', error)
            return args
        }
    })

    if (typeof unpatch === 'function') unpatches.push(unpatch)
}

function hookPressable(type) {
    hook(type, props => {
        const selected = isSelected(props)
        return {
            ...props,
            style: stylePatch(props.style, {
                surface: true,
                selected,
            }),
        }
    })
}

export default plugin({
    start() {
        // Text: make neutral Discord whites/greys cyan while preserving role colours.
        hook(ReactNative.Text, props => ({
            ...props,
            style: stylePatch(props.style, { text: true }),
        }))

        // Existing Discord dark-grey surfaces -> OLED black / dark plum.
        hook(ReactNative.View, props => ({
            ...props,
            style: stylePatch(props.style, {
                surface: true,
                selected: isSelected(props),
            }),
        }))

        hook(ReactNative.ScrollView, props => ({
            ...props,
            style: stylePatch(props.style, { surface: true }),
            contentContainerStyle: stylePatch(props.contentContainerStyle, { surface: true }),
        }))

        // Composer/search fields get the stronger red HUD treatment.
        hook(ReactNative.TextInput, props => ({
            ...props,
            style: stylePatch(props.style, {
                surface: true,
                text: true,
                input: true,
            }),
            placeholderTextColor: C.mutedCyan,
            selectionColor: C.yellow,
            cursorColor: C.red,
        }))

        // Most interactive rows/buttons are Pressable or TouchableOpacity.
        hookPressable(ReactNative.Pressable)
        hookPressable(ReactNative.TouchableOpacity)
        hookPressable(ReactNative.TouchableHighlight)

        // Neutral monochrome image tints become cyan. Coloured emoji/avatar images survive.
        hook(ReactNative.Image, props => ({
            ...props,
            style: stylePatch(props.style, { icon: true }),
        }))

        console.log('[CIPHER // 2077] UI v0.1.0 active')
    },

    stop() {
        for (const unpatch of unpatches.splice(0).reverse()) {
            try {
                unpatch()
            } catch {}
        }

        console.log('[CIPHER // 2077] UI stopped')
    },
})
