import { ExtensionContext, Range, TextDocument, TextEdit, languages } from 'vscode';

function findFirstBracketPairEndIndex(string: string, openChar = "{", closeChar = "}") {
    let openBrackets = 0;
    for (const [i, char] of string.split("").entries()) {
        if (char === openChar) {
            openBrackets++
        } else if (char === closeChar) {
            openBrackets--;
            if (openBrackets === 0) return i;
            if (openBrackets < 0) return i; // invalid brackets
        }
    }
    return -1; // no  brackets found
}

export function activate(context: ExtensionContext) {
    languages.registerDocumentFormattingEditProvider('lilypond', {
        provideDocumentFormattingEdits(document: TextDocument) {
            const text = document.getText()

            // -- Header --
            const headerMatches = [...text.matchAll(/\\header(\s|\n)*{/g)]
            const headerBlocks = headerMatches.map((match) => {
                const preamble = match[0]
                const matchTextToEnd = text.slice(match.index)
                const endIndex = findFirstBracketPairEndIndex(matchTextToEnd)
                const body = matchTextToEnd.slice(preamble.length, endIndex)
                return { preamble: preamble, body: body, index: match.index, initialLength: preamble.length + body.length }
            })
            const headerEdits = headerBlocks.map((block) => {
                const newPreamble = block.preamble.replace(/\\header(\s|\n)*{/g, "\\header {\n")
                const newBody = block.body.replace(/(?:\s|\n)*(\w*)(?:\s|\n)*=(?:\s|\n)*(".*?")(?:\s|\n)*/g, "\t$1 = $2\n")
                const newHeaderText = newPreamble + newBody

                const start = document.positionAt(block.index)
                const end = document.positionAt(block.index + block.initialLength)
                return TextEdit.replace(new Range(start, end), newHeaderText)
            })

            // -- Voices --
            const voiceMatches = [...text.matchAll(/(\w*)(?:\s|\n)*=(?:\s|\n)*\\relative(.|\n)*?{/g)]
            const voiceBlocks = voiceMatches.map((match) => {
                const preamble = match[0]
                const matchTextToEnd = text.slice(match.index)
                const endIndex = findFirstBracketPairEndIndex(matchTextToEnd)
                const body = matchTextToEnd.slice(preamble.length, endIndex)
                return { preamble: preamble, body: body, index: match.index, initialLength: preamble.length + body.length }
            })
            const voiceEdits = voiceBlocks.map((block) => {
                const newPreamble = block.preamble.replace(/(\w*)(?:\s|\n)*=(?:\s|\n)*\\relative\s(?:\s|\n)*(.*?)(?:\s|\n)*{/g, "$1 = \\relative $2 {\n")

                // -- Fix stems --
                let previousStem = ''
                const splitBody = block.body.split(/(?<=(?:\\stemDown)|(?:\\stemUp)|(?:\\stemNeutral))/)
                const noDoubleStems = splitBody.map((e) => {
                    const currentStemMatch = e.match(/(?:\\stemDown)|(?:\\stemUp)|(?:\\stemNutral)/)
                    if (!currentStemMatch) return e
                    const currentStem = currentStemMatch[0]
                    if (currentStem != previousStem) {
                        previousStem = currentStem
                        return e
                    }
                    const remplaced = e.replace(currentStem, '')
                    return remplaced
                }).join('')

                const noBarNumberChecks = noDoubleStems.replace(/\\barNumberCheck #(\d*)/g, '%$1\n')
                const noNewLines = noBarNumberChecks.replace(/[\n\r]/g, '')
                const noDoubleSpaces = noNewLines.replace(/  +/g, ' ')
                const linePerComment = noDoubleSpaces.replace(/%\s*(\d*)/gms, "% $1\n")

                const newHeaderText = newPreamble + linePerComment

                const start = document.positionAt(block.index)
                const end = document.positionAt(block.index + block.initialLength)
                return TextEdit.replace(new Range(start, end), newHeaderText)
            })

            return [...headerEdits, ...voiceEdits]
        }
    });
}
