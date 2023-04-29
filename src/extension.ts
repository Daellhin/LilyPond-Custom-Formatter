'use strict';

import * as vscode from 'vscode';

function findFirstBracketPairEndIndex(string: string, openChar = "{", closeChar = "}") {
    let openBrackets = 0;
    //string = [...string].filter(e => e === openChar || e === closeChar).join('');
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

export function activate(context: vscode.ExtensionContext) {

    // 👎 formatter implemented as separate command
    vscode.commands.registerCommand('extension.format-foo', () => {
        const { activeTextEditor } = vscode.window;

        if (activeTextEditor && activeTextEditor.document.languageId === 'foo-lang') {
            const { document } = activeTextEditor;
            const firstLine = document.lineAt(0);
            if (firstLine.text !== '42') {
                const edit = new vscode.WorkspaceEdit();
                edit.insert(document.uri, firstLine.range.start, '42\n');
                return vscode.workspace.applyEdit(edit)
            }
        }
    });

    // 👍 formatter implemented using API
    vscode.languages.registerDocumentFormattingEditProvider('lilypond', {
        provideDocumentFormattingEdits(document: vscode.TextDocument) {
            const text = document.getText()
            // -- Cleanup --
            const cleanedText = text
                .replace(/ *= */g, ' = ') // remove spaces around =

            // -- Format -- 
            const matchedBlocks = Array.from(cleanedText
                .matchAll(/(?<=((^|}|"|%.*)(\s|\n)*))(?<!({})(\s|\n)*)((\\version)|(\\header)|(\\layout)|(\\include)|((.*=\s*)?\\relative)|(\\score)|(%(?!.*\n*.*(}|%))))/g))
            const blocks1 = matchedBlocks
                .map(match => {
                    let endIndex = 0;
                    const matchTextAndLeftover = cleanedText.slice(match.index, cleanedText.length)
                    if (match[0].startsWith("%"))
                        endIndex = matchTextAndLeftover.indexOf("\n") - 1
                    else if (match[0].startsWith("\\version") || match[0].startsWith("\\include"))
                        endIndex = findNthIndex(matchTextAndLeftover, `"`, 2)
                    else
                        endIndex = findFirstBracketPairEndIndex(matchTextAndLeftover)

                    const matchText = matchTextAndLeftover.slice(0, endIndex + 1)
                    return { text: matchText, index: match.index }
                })
            const blocks2 = blocks1
                .filter((match, _, array) => {
                    const startIndex = match.index
                    const endIndex = match.index + match.text.length
                    array.forEach((otherMatch, otherIndex) => {
                        if (otherIndex !== match.index) return
                        const otherStartIndex = otherMatch.index
                        const otherEndIndex = otherMatch.index + otherMatch.text.length
                        if (otherStartIndex < startIndex && otherEndIndex < endIndex)
                            return false
                    })
                    return true;
                })
            const blocks3 = blocks2
                .map(match => {
                    if (match.text.includes("\\relative")) {
                        const preamble = match.text.match(/.*?\\relative .*?{/g)
                        const body = match.text.replace(preamble[0], '').trim()

                        // -- Fix barnumbercheck --
                        const newBody = body.replace(/\\barNumberCheck #(\d*)/g, '%$1\n')

                        // -- Fix stems --
                        let previousStem = ''
                        const newBody2Split = newBody.split(/(?<=(?:\\stemDown)|(?:\\stemUp)|(?:\\stemNeutral))/)
                        const newBody2 = newBody2Split.map((e) => {
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

                        // -- Fix comments --
                        const rows = newBody2.match(/.*?%.*?$/gms)

                        // -- Fix indentation --
                        const newRows = rows.map(row => {
                            const newRow = row
                                .replace(/[\n\r]/g, '') // remove newlines
                                .replace(/  +/g, ' ')   // remove double spaces
                                .trim()
                            return "\t" + newRow
                        })
                            .join('\n')
                        return preamble + "\n" + newRows + "\n}"
                    }
                    return match.text
                })
            const formattedBlocks = blocks3.join('\n\n')

            const wholeDocument = new vscode.Range(document.positionAt(0), document.positionAt(text.length))
            return [vscode.TextEdit.replace(wholeDocument, formattedBlocks)]
        }
    });
}
