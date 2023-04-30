import { ExtensionContext, Range, TextDocument, TextEdit, languages } from 'vscode';

type Block = {
    preamble: string,
    body: string,
    index: number,
    initialLength: number
}

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

function findNthIndex(string: string, char: string, n: number) {
    let index = -1;
    for (let i = 0; i < n; i++) {
        index = string.indexOf(char, index + 1);
        if (index === -1) break; // end of string reached, nth char not found
    }
    return index;
}

function createFormatBlocks(text: string, matches: RegExpMatchArray[], blockendFinder: (string: string) => number, includeEnd = false) {
    return matches.map((match) => {
        const preamble = match[0]
        const matchTextToEnd = text.slice(match.index)
        const endIndex = blockendFinder(matchTextToEnd)
        const body = matchTextToEnd.slice(preamble.length, endIndex + (includeEnd ? 1 : 0))
        return { preamble: preamble, body: body, index: match.index, initialLength: preamble.length + body.length }
    })
}

function createTextReplacements(document, blocks: Block[], editor: (block: Block) => string) {
    return blocks.map((block) => {
        const start = document.positionAt(block.index)
        const end = document.positionAt(block.index + block.initialLength)
        return TextEdit.replace(new Range(start, end), editor(block))
    })
}

export function activate(context: ExtensionContext) {
    languages.registerDocumentFormattingEditProvider('lilypond', {
        provideDocumentFormattingEdits(document: TextDocument) {
            const text = document.getText()

            // -- Header --
            const headerMatches = [...text.matchAll(/\\header(\s|\n)*{/g)]
            const headerBlocks = createFormatBlocks(text, headerMatches, findFirstBracketPairEndIndex);
            const headerEdits = createTextReplacements(document, headerBlocks, (block) => {
                const newPreamble = block.preamble.replace(/\\header(\s|\n)*{/g, "\\header {\n")
                const newBody = block.body.replace(/(?:\s|\n)*(\w*)(?:\s|\n)*=(?:\s|\n)*(".*?")(?:\s|\n)*/g, "\t$1 = $2\n")
                const newHeaderText = newPreamble + newBody
                return newHeaderText
            })

            // -- Version --
            const versionMatches = [...text.matchAll(/\\version(\s|\n)*(?=")/g)]
            const versionBlocks = createFormatBlocks(text, versionMatches, (e) => findNthIndex(e, `"`, 2), true);
            const versionEdits = createTextReplacements(document, versionBlocks, (block) => {
                const newPreamble = block.preamble.replace(/\\version(\s|\n)*/g, "\\version ")
                const newBody = block.body
                const newHeaderText = newPreamble + newBody
                return newHeaderText
            })

            // -- Voices --
            const voiceMatches = [...text.matchAll(/(\w*)(?:\s|\n)*=(?:\s|\n)*\\relative(.|\n)*?{/g)]
            const voiceBlocks = createFormatBlocks(text, voiceMatches, findFirstBracketPairEndIndex);
            const voiceEdits = createTextReplacements(document, voiceBlocks, (block) => {
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
                    const replaced = e.replace(currentStem, '')
                    return replaced
                }).join('')

                const noBarNumberChecks = noDoubleStems.replace(/\\barNumberCheck #(\d*)/g, '%$1\n')
                const noNewLines = noBarNumberChecks.replace(/[\n\r]/g, '')
                const noDoubleSpaces = noNewLines.replace(/  +/g, ' ')
                const linePerComment = noDoubleSpaces.replace(/%\s*(\d*)/gms, "% $1\n")
                const indentLines = linePerComment.replace(/^\s*(.*)/gm, '\t$1')
                const newHeaderText = newPreamble + indentLines + '\n'
                return newHeaderText
            })

            return [...headerEdits, ...versionEdits, ...voiceEdits]
        }
    });
}
