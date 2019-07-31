import { Uri, window, workspace, ViewColumn, commands, QuickPickOptions, TextDocumentShowOptions, ProgressLocation, ProgressOptions, Range } from 'vscode';
import { Campaign } from './models/Campaign';
import { ITreeItem } from './models/ITreeItem';
import { campaignExplorerProvider } from './campaignExplorerProvider';
import { DMBSettings } from './Settings';
import { renderCampaign } from './renderer';
import * as matter from 'gray-matter';
import * as fse from 'fs-extra';
import { BrowserFetcher } from './BrowserFetcher';
import { GeneratorSource } from './models/GeneratorSource';
import { DungeonGeneratorConfig, parseDungeonGeneratorConfig } from './generators/dungeon/DungeonGeneratorConfig';
import { DungeonGenerator } from './generators/dungeon/DungeonGenerator';
import { CampaignHelpers } from './helpers/CampaignHelpers';
import { ComponentHelpers } from './helpers/ComponentHelpers';
import { GeneratorHelpers } from './helpers/GeneratorHelpers';

export namespace ExtensionCommands {
    export async function promptChooseChromeExecutable(): Promise<void> {
        const execPath = await window.showOpenDialog({
            openLabel: "Use Selected Chrome",
            canSelectMany: false
        });
        if (!execPath && DMBSettings.chromeExecutablePath) {
            // let items: QuickPickItem[] = [
            //     {
            //         label: "Keep Existing",
            //         description: DMBSettings.chromeExecutablePath
            //     },
            //     {
            //         label: "Clear Existing",
            //         description: "Use Default Instead"
            //     }
            // ];
            // const keepExistingChoice = await window.showQuickPick(items, { })
        }
        if (execPath && execPath.length === 1 && await fse.pathExists(execPath[0].fsPath)) {
            await DMBSettings.updateChromeExecutablePath(execPath[0].fsPath);
        }
    }

    export async function promptDownloadChromiumRevision(): Promise<void> {
        let suggestedRevision = require('../package.json').puppeteer.chromium_revision;
        const chromeRev = await window.showInputBox({
            prompt: `Recommended revision: ${suggestedRevision}`,
            value: suggestedRevision,
            placeHolder: "Chromium Revision Number"
        });
        if (chromeRev) {
            let fetcher = new BrowserFetcher();
            if (await fetcher.canDownload(chromeRev)) {
                let progOpts: ProgressOptions = {
                    location: ProgressLocation.Notification,
                    title: `Downloading Chromium Revision`
                };
                return window.withProgress(progOpts, async (progress, token) => {
                    progress.report({
                        message: chromeRev
                    });
                    let revInfo = await fetcher.download(chromeRev);
                    if (revInfo) {
                        DMBSettings.chromeExecutablePath = revInfo.executablePath;
                    } else {
                        window.showErrorMessage(`Failed to download Chromium revision ${chromeRev}`);
                    }
                });
            } else {
                window.showErrorMessage(`"${chromeRev}" is not a valid Chromium revision number for the given platform (${await fetcher.platform()})`);
            }
        }
    }

    export async function promptInitCampaign(): Promise<void> {
        const currFolder = workspace.workspaceFolders ? workspace.workspaceFolders[0] : undefined;
        if (currFolder) {
            const qpOpts: QuickPickOptions = {
                canPickMany: false,
                ignoreFocusOut: true,
                placeHolder: 'Create a new DM Binder campaign in the current folder? (' + currFolder.uri.path + ')'
            };
            const confirmInit = await window.showQuickPick(['Yes', 'No'], qpOpts);
            if (confirmInit && confirmInit === 'Yes') {
                // TODO: status bar tricks
                await CampaignHelpers.initCampaign(currFolder.uri);
            }
        } else {
            window.showErrorMessage('You need to open up a folder in VS Code before you can initialize a DMBinder campaign.');
            return;
        }
    }

    export async function renderCampaignSources(campaignPath?: string): Promise<void> {
        if (campaignPath && await Campaign.hasCampaignConfig(campaignPath)) {
            await renderCampaign(new Campaign(campaignPath));
        } else {
            let campaign = await CampaignHelpers.promptSelectCampaign(undefined, true);
            if (campaign) {
                await renderCampaign(campaign);
            }
        }
        return;
    }

    export async function editTreeItem(item?: ITreeItem): Promise<void> {
        if (item && item.getTreeItem) {
            let treeItem = await item.getTreeItem();
            if (treeItem && treeItem.resourceUri) {
                let opts: TextDocumentShowOptions = {
                    preview: false
                };
                commands.executeCommand('vscode.open', treeItem.resourceUri, opts);
            }
        }
    }

    export async function promptBuildComponent(item?: ITreeItem): Promise<void> {
        let result = await ComponentHelpers.promptGenerateComponent(item);
        if (result) {
            const doc = await workspace.openTextDocument({
                content: result
            });
            await window.showTextDocument(doc, ViewColumn.Active);
        }
    }

    export async function promptInsertComponent(item?: ITreeItem): Promise<void> {
        let result = await ComponentHelpers.promptGenerateComponent(item);
        if (result) {
            let editor = window.activeTextEditor;
            let res = result;
            if (editor) {
                let selection = editor.selection;
                await editor.edit((editBuilder) => {
                    editBuilder.replace(selection, res);
                });
            }
        }
    }

    export function toggleTreeViewStyle() {
        switch (DMBSettings.treeViewStyle) {
            case 'split':
                DMBSettings.treeViewStyle = 'composite';
                break;
            case 'composite':
            default:
                DMBSettings.treeViewStyle = 'split';
                break;
        }
    }

    export function toggleHomebreweryEnabled() {
        DMBSettings.homebreweryEnabled = !DMBSettings.homebreweryEnabled;
    }

    export async function generateElementFromConfig(item?: ITreeItem): Promise<void> {
        let generatorUri: Uri | undefined;
        if (!item || !item.getTreeItem) {
            const qpItemList = await campaignExplorerProvider.getGeneratorItems();
            if (qpItemList && qpItemList.length) {
                const qpOpts: QuickPickOptions = {
                    canPickMany: false,
                    placeHolder: 'Select the generator to use'
                };
                const generatorItem = await window.showQuickPick(qpItemList, qpOpts);
                if (generatorItem && generatorItem.detail) {
                    generatorUri = Uri.file(generatorItem.detail);
                }
            } else {
                window.showWarningMessage("No valid generator configs found.");
            }
        } else {
            const treeItem = await item.getTreeItem();
            generatorUri = treeItem.resourceUri;
        }
        if (generatorUri) {
            let generator = await GeneratorSource.loadGeneratorSource(generatorUri.fsPath);
            let editor = window.activeTextEditor;
            let res = await generator.generateContent();
            if (editor) {
                let selection = editor.selection;
                await editor.edit((editBuilder) => {
                    editBuilder.replace(selection, res);
                });
            }
        }
    }

    export async function generateElementFromConfigPromptArgs(item?: ITreeItem): Promise<void> {
        let generatorUri: Uri | undefined;
        if (!item || !item.getTreeItem) {
            const qpItemList = await campaignExplorerProvider.getGeneratorItems();
            if (qpItemList && qpItemList.length) {
                const qpOpts: QuickPickOptions = {
                    canPickMany: false,
                    placeHolder: 'Select the generator to use'
                };
                const generatorItem = await window.showQuickPick(qpItemList, qpOpts);
                if (generatorItem && generatorItem.detail) {
                    generatorUri = Uri.file(generatorItem.detail);
                }
            } else {
                window.showWarningMessage("No valid generator configs found.");
            }
        } else {
            const treeItem = await item.getTreeItem();
            generatorUri = treeItem.resourceUri;
        }
        if (generatorUri) {
            let generator = await GeneratorSource.loadGeneratorSource(generatorUri.fsPath);
            let editor = window.activeTextEditor;
            let res = await generator.generateContent({}, GeneratorHelpers.promptGeneratorInput);
            if (editor) {
                let selection = editor.selection;
                await editor.edit((editBuilder) => {
                    editBuilder.replace(selection, res);
                });
            }
        }
    }

    export async function generateDungeonMap(): Promise<void> {
        let activeTextEditor = window.activeTextEditor;
        let config: DungeonGeneratorConfig | undefined;
        if (activeTextEditor && activeTextEditor.selection && !activeTextEditor.selection.isEmpty) {
            let selection = activeTextEditor.selection;
            // Try to grab config from selection
            let selectedText = activeTextEditor.document.getText(new Range(selection.start, selection.end));
            if (matter.test(selectedText, { delimiters: ['---', '...'] })) {
                let data = matter(selectedText, { delimiters: ['---', '...'] }).data;
                
                if (data.seed !== undefined ||
                    data.rowCount !== undefined ||
                    data.columnCount !== undefined ||
                    data.dungeonLayout !== undefined ||
                    data.minimumRoomSize !== undefined ||
                    data.maximumRoomSize !== undefined ||
                    data.roomLayout !== undefined ||
                    data.corridorLayout !== undefined ||
                    data.removeDeadendsRatio !== undefined ||
                    data.addStairCount !== undefined ||
                    data.mapStyle !== undefined ||
                    data.cellSize !== undefined) {
                    config = parseDungeonGeneratorConfig(
                        data.seed,
                        data.rowCount,
                        data.columnCount,
                        data.dungeonLayout,
                        data.minimumRoomSize,
                        data.maximumRoomSize,
                        data.roomLayout,
                        data.corridorLayout,
                        data.removeDeadendsRatio,
                        data.addStairCount,
                        data.mapStyle,
                        data.cellSize);
                    }
            }
        }
        if (!config) {
            // Prompt for the config
            config = await GeneratorHelpers.promptGenerateDungeonMapSettings();
        }
        if (config) {
            try {
                let generator = new DungeonGenerator(config);
                let result = "<html>\n<body>\n" + generator.generate() + "\n</body>\n</html>";
                const doc = await workspace.openTextDocument({
                    content: result,
                    language: "markdown"
                });
                await window.showTextDocument(doc, ViewColumn.Active);
            } catch (e) {
                console.log(e);
            }
        }
    }
}