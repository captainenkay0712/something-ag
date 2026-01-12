const completionCoin = (s: string): string => {
    const index = s.indexOf("::")
    if (index === -1) {
        return s
    }

    const prefix = s.substring(0, index)
    const rest = s.substring(index)

    if (!prefix.startsWith("0x")) {
        return s
    }

    const hexStr = prefix.substring(2)

    if (hexStr.length > 64) {
        return s
    }

    const paddedHexStr = hexStr.padStart(64, "0")

    return `0x${paddedHexStr}${rest}`
}

export { completionCoin }

