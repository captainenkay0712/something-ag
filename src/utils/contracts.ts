import { normalizeSuiObjectId } from '@mysten/sui/utils'
import type { SuiAddress, SuiStructTag } from '../types/sui'
import { CoinUtils, GAS_TYPE_ARG, GAS_TYPE_ARG_LONG } from '../types/CoinAssist'

export function composeType(address: string, generics: SuiAddress[]): SuiAddress
export function composeType(address: string, struct: string, generics?: SuiAddress[]): SuiAddress
export function composeType(address: string, module: string, struct: string, generics?: SuiAddress[]): SuiAddress
export function composeType(address: string, ...args: unknown[]): SuiAddress {
    const generics: string[] = Array.isArray(args[args.length - 1]) ? (args.pop() as string[]) : []
    const chains = [address, ...args].filter(Boolean)

    let result: string = chains.join('::')

    if (generics && generics.length) {
        result += `<${generics.join(', ')}>`
    }

    return result
}

const extractStructTagFromType = (type: string): SuiStructTag => {
    try {
        let _type = type.replace(/\s/g, '')

        const genericsString = _type.match(/(<.+>)$/)
        const generics = genericsString?.[0]?.match(/(\w+::\w+::\w+)(?:<.*?>(?!>))?/g)
        if (generics) {
            _type = _type.slice(0, _type.indexOf('<'))
            const tag = extractStructTagFromType(_type)
            const structTag: SuiStructTag = {
                ...tag,
                type_arguments: generics.map((item) => extractStructTagFromType(item).source_address),
            }
            structTag.type_arguments = structTag.type_arguments.map((item) => {
                return CoinUtils.isSuiCoin(item) ? item : extractStructTagFromType(item).source_address
            })
            structTag.source_address = composeType(structTag.full_address, structTag.type_arguments)
            return structTag
        }
        const parts = _type.split('::')

        const isSuiCoin = _type === GAS_TYPE_ARG || _type === GAS_TYPE_ARG_LONG

        const structTag: SuiStructTag = {
            full_address: _type,
            address: isSuiCoin ? '0x2' : normalizeSuiObjectId(parts[0]),
            module: parts[1],
            name: parts[2],
            type_arguments: [],
            source_address: '',
        }
        structTag.full_address = `${structTag.address}::${structTag.module}::${structTag.name}`
        structTag.source_address = composeType(structTag.full_address, structTag.type_arguments)
        return structTag
    } catch (error) {
        return {
            full_address: type,
            address: '',
            module: '',
            name: '',
            type_arguments: [],
            source_address: type,
        }
    }
}

const normalizeCoinType = (coinType: string): string => {
    return extractStructTagFromType(coinType).source_address
}

export {
    extractStructTagFromType,
    normalizeCoinType,
}