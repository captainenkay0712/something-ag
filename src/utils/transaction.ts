import { Transaction } from "@mysten/sui/transactions"

const printTransaction = (tx: Transaction, isPrint = true) => {
    console.log(`inputs`, tx.getData().inputs)
    let i = 0

    tx.getData().commands.forEach((item, index) => {
        if (isPrint) {
            console.log(
                `transaction ${index}: `,
                JSON.stringify(item, bigIntReplacer, 2)
            )
            i++
        }
    })
}

const bigIntReplacer = (key: string, value: any) => {
    if (typeof value === "bigint") {
        return value.toString()
    }
    return value
}

export { printTransaction }
