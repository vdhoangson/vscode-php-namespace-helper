import { DeclarationLines } from "./interfaces";
import {
  getFromFunctionParameters,
  getInitializedWithNew,
  getFromStaticCalls,
  getFromInstanceofOperator,
  getFromTypeHints,
  getFromReturnType,
} from "./helpers";
import { findComposerFileByUri, getComposerFileData } from "./helpers/composer";
import * as vscode from "vscode";
import * as Parser from "./Parser";
import { compare } from "natural-orderby";
import path from "node:path";
import builtInClasses from "./BuildInClasses";
import fs from "fs-extra";

const regexWordWithNamespace = new RegExp(/[a-zA-Z0-9\\]+/);
const outputChannel = vscode.window.createOutputChannel(
  "PHP Namespace Helper",
  "log"
);

export class PhpNamespaceHelper {
  BUILT_IN_CLASSES: any = builtInClasses;
  EDITOR!: vscode.TextEditor;
  CLASS_AST: any;
  multiImporting: boolean = false;
  CWD!: string;

  constructor() {
    try {
      this.CWD = vscode.workspace.workspaceFolders![0].uri.fsPath;
    } catch (error) {
      this.CWD = "";
    }

    this.getPHPClassList();
  }

  setEditorAndAST() {
    const editor: any = vscode.window.activeTextEditor;

    this.EDITOR = editor;

    try {
      this.CLASS_AST = Parser.buildClassASTFromContent(
        editor.document.getText()
      );
    } catch (error: any) {
      this.showMessage(error.message, true);
      console.error(error);
      throw new Error();
    }
  }

  getPHPClassList(): Promise<any> {
    return Promise.all(
      //@ts-ignore
      this.config("builtIns").map(
        async (method: any) => await this.runPhpCli(method)
      )
    )
      .then((_data) => (this.BUILT_IN_CLASSES = _data.flat()))
      .catch((error: any) => {
        console.error(error);
        outputChannel.appendLine(error.message);
      });
  }

  async runPhpCli(method: any) {
    const phpCommand = this.config("command");

    if (!phpCommand) {
      throw new Error('Config required : "phpNamespaceHelper.command"');
    }

    try {
      const { execaCommand } = await import("execa");
      const { stdout } = await execaCommand(
        `${phpCommand} -r "echo json_encode(${method});"`,
        {
          cwd: this.CWD,
          shell: vscode.env.shell,
        }
      );

      return JSON.parse(stdout);
    } catch (error: any) {
      console.error(error);
      // outputChannel.replace(error.message);
      // outputChannel.show();
    }
  }

  async expandCommand(selection: vscode.Selection) {
    this.setEditorAndAST();

    const resolving = this.resolving(selection);

    if (resolving === undefined) {
      return this.showMessage("No class is selected.", true);
    }

    let className = resolving;

    if (/\w+\\/.test(resolving)) {
      className = className.replace(/\w+\\/g, "");
    }

    const files = await this.findFiles(className);
    const namespaces = await this.findNamespaces(className, files);
    const fileNameSpace = await this.pickClass(
      namespaces.filter((item: any) => item.endsWith(resolving))
    );

    await this.changeSelectedClass(selection, fileNameSpace, true);
  }

  async importCommand(selected: vscode.Selection) {
    let resolving = this.resolving(selected);

    if (resolving === undefined) {
      return this.showErrorMessage(`No class is selected.`);
    }

    let fileNameSpace;
    let replaceClassAfterImport: boolean = false;

    if (/^\\/.test(resolving)) {
      fileNameSpace = resolving.replace(/^\\/, "");
      replaceClassAfterImport = true;
    } else if (/\w+\\/.test(resolving)) {
      fileNameSpace = resolving.replace(/\w+\\/g, "");

      const files = await this.findFiles(fileNameSpace);
      const namespaces = await this.findNamespaces(fileNameSpace, files);
      fileNameSpace = await this.pickClass(
        namespaces.filter((item: any) => item.endsWith(resolving))
      );
    } else {
      const files = await this.findFiles(resolving);
      const namespaces = await this.findNamespaces(resolving, files);

      fileNameSpace = await this.pickClass(namespaces);
    }

    return this.importClass(selected, fileNameSpace, replaceClassAfterImport);
  }

  /**
   * Import all class
   */
  async importAllCommand() {
    this.setEditorAndAST();

    const { useStatements, declarationLines } = this.getDeclarations();
    let phpClasses = this.getPhpClasses(declarationLines);
    this.multiImporting = true;

    if (phpClasses?.length > 0) {
      phpClasses = phpClasses.filter(
        (phpClass: string) =>
          !this.hasConflict(useStatements, phpClass) &&
          !this.hasAliasConflict(useStatements, phpClass)
      );

      phpClasses = [...new Set(phpClasses)];

      if (phpClasses?.length > 0) {
        for (let phpClass of phpClasses) {
          if (phpClass === phpClasses[phpClasses?.length - 1]) {
            this.multiImporting = false;
          }

          try {
            await this.importCommand(phpClass);
          } catch (error: any) {
            console.error(error);
            this.showErrorMessage(`${phpClass} can not found!`);
            continue;
          }
        }
      } else {
        this.showMessage(`No more class need import!`);
      }
    }
  }

  /**
   * Get php classes
   * @param declarationLines
   * @returns
   */
  getPhpClasses(declarationLines: DeclarationLines) {
    const text = this.EDITOR.document.getText();
    const _class = declarationLines.class;
    let phpClasses: any = [];

    if (_class?.extends !== null) {
      phpClasses = phpClasses.concat(_class.extends.name);
    }

    if (_class?.implements !== null) {
      phpClasses = phpClasses.concat(
        _class.implements
          .filter((item: any) => item.resolution === "uqn")
          .map((item: any) => item.name)
      );
    }

    phpClasses = phpClasses.concat(
      ...getFromFunctionParameters(declarationLines.class)
    );

    phpClasses = phpClasses.concat(getInitializedWithNew(text));
    phpClasses = phpClasses.concat(getFromStaticCalls(text));
    phpClasses = phpClasses.concat(getFromInstanceofOperator(text));
    phpClasses = phpClasses.concat(
      getFromTypeHints(text, this.BUILT_IN_CLASSES)
    );
    phpClasses = phpClasses.concat(
      getFromReturnType(text, this.BUILT_IN_CLASSES)
    );
    phpClasses = phpClasses.concat(
      declarationLines.trait?.map((item: any) => item.name)
    );
    return phpClasses.filter((item: any) => item);
  }

  importClass(
    selected: vscode.Selection,
    fileNameSpace: any,
    replaceClassAfterImport = false
  ) {
    try {
      const { useStatements, declarationLines } = this.getDeclarations();
      const classBaseName = fileNameSpace.match(/(\w+)/g).pop();

      if (this.hasConflict(useStatements, classBaseName)) {
        if (this.multiImporting) {
          return;
        }

        return this.insertAsAlias(
          selected,
          fileNameSpace,
          useStatements,
          declarationLines
        );
      }

      if (this.hasAliasConflict(useStatements, classBaseName)) {
        return this.showMessage(
          `class : '${classBaseName}' is used as alias.`,
          true
        );
      }

      if (replaceClassAfterImport) {
        return this.importAndReplaceSelectedClass(
          selected,
          classBaseName,
          fileNameSpace,
          declarationLines
        );
      }

      return this.insert(fileNameSpace, declarationLines);
    } catch (error: any) {
      return this.showMessage(error.message, true);
    }
  }

  /**
   * Edit class into editor
   * @param insertLine
   * @param text
   */
  async insertEditor(insertLine: any, text: string) {
    await this.EDITOR.edit(
      (textEdit) => {
        textEdit.insert(new vscode.Position(insertLine, 0), `${text};\n`);
      },
      { undoStopBefore: false, undoStopAfter: false }
    );
  }

  /**
   * Edit class into editor
   * @param insertLine
   * @param text
   */
  async replaceEditor(position: any, text: string) {
    await this.EDITOR.edit(
      (textEdit) => {
        textEdit.replace(position, `${text};\n`);
      },
      { undoStopBefore: false, undoStopAfter: false }
    );
  }

  async insert(
    fileNameSpace: string,
    declarationLines: DeclarationLines,
    alias: string | undefined = undefined
  ) {
    const insertLine = this.getInsertLine(declarationLines);
    let text = `use ${fileNameSpace}`;

    if (alias) {
      text += ` as ${alias}`;
    }

    await this.insertEditor(insertLine, text);

    if (this.config("autoSort")) {
      this.setEditorAndAST();
      await this.sortImports();
    }

    if (!this.multiImporting) {
      return this.showMessage("The class is imported.");
    }
  }

  async insertAsAlias(
    selection: vscode.Selection,
    fileNameSpace: any,
    useStatements: any,
    declarationLines: DeclarationLines
  ) {
    const alias: any = await vscode.window.showInputBox({
      placeHolder: "Enter an alias or leave it empty to replace",
    });

    if (alias === undefined) {
      return;
    }

    if (alias === "") {
      return this.insertNewUseStatement(
        selection,
        fileNameSpace,
        useStatements,
        declarationLines
      );
    }

    if (this.hasAliasConflict(useStatements, alias)) {
      await this.showMessage(`Alias : '${alias}' is already in use.`, true);
    }

    return this.importAndReplaceSelectedClass(
      selection,
      alias,
      fileNameSpace,
      declarationLines,
      alias
    );
  }
  async insertNewUseStatement(
    selection: vscode.Selection,
    fileNameSpace: any,
    useStatements: Array<any>,
    declarationLines: DeclarationLines
  ) {
    if (useStatements.find((use) => use.text === fileNameSpace)) {
      return this.showMessage(`'${fileNameSpace}' already exists`, true);
    }

    const editor = this.EDITOR;
    const classBaseName = fileNameSpace.match(/(\w+)/g).pop();
    const similarImport = useStatements.find(
      (use) =>
        use.text.endsWith(classBaseName) || fileNameSpace.startsWith(use.text)
    );

    if (similarImport) {
      if (this.config("forceReplaceSimilarImports")) {
        let useCall = `use ${fileNameSpace}`;

        if (similarImport.alias) {
          useCall = `${useCall} as ${similarImport.alias}`;
        }
        await this.replaceEditor(
          editor.document.lineAt(similarImport.line).range,
          useCall
        );

        return;
      } else {
        return this.showMessage(
          `use statement '${similarImport.text}' already exists`,
          true
        );
      }
    }

    await this.replaceEditor(
      editor.document.getWordRangeAtPosition(
        selection.active,
        regexWordWithNamespace
      ),
      classBaseName
    );

    await this.insert(fileNameSpace, declarationLines);
  }

  async replaceNamespaceStatement(namespace: any, line: any) {
    if (this.EDITOR) {
      let realLine = line - 1;
      let text = this.EDITOR.document.lineAt(realLine).text;
      let newNs = text.replace(/namespace (.+)/, namespace);

      await this.EDITOR.edit((textEdit: any) => {
        textEdit.replace(
          new vscode.Range(realLine, 0, realLine, text?.length),
          newNs.trim()
        );
      });
    }
  }

  /**
   * importAndReplaceSelectedClass
   * @param selection
   * @param replacingClassName
   * @param fileNameSpace
   * @param declarationLines
   * @param alias
   */
  async importAndReplaceSelectedClass(
    selection: vscode.Selection,
    replacingClassName: any,
    fileNameSpace: any,
    declarationLines: DeclarationLines,
    alias: string | undefined = undefined
  ) {
    try {
      await this.changeSelectedClass(selection, replacingClassName, false);
      this.insert(fileNameSpace, declarationLines, alias);
    } catch (e: any) {
      console.error(e);
    }
  }

  async changeSelectedClass(
    selection: vscode.Selection,
    replacingClassName: any,
    prependBackslash = false
  ) {
    await this.EDITOR.edit(
      (textEdit) => {
        textEdit.replace(
          //@ts-ignore
          this.EDITOR.document.getWordRangeAtPosition(
            selection.active,
            regexWordWithNamespace
          ),
          (prependBackslash && this.config("leadingSeparator") ? "\\" : "") +
            replacingClassName
        );

        const { useStatements } = this.getDeclarations();
        const useStatement = useStatements.find(
          (item: any) => item.text === replacingClassName
        );

        if (useStatement) {
          textEdit.delete(
            new vscode.Range(useStatement.line, 0, useStatement.line + 1, 0)
          );
        }
      },
      { undoStopBefore: false, undoStopAfter: false }
    );

    const newPosition = new vscode.Position(
      selection.active.line,
      selection.active.character
    );

    this.EDITOR.selection = new vscode.Selection(newPosition, newPosition);
  }

  async sortCommand() {
    this.setEditorAndAST();

    try {
      await this.sortImports();

      // if (!this.config("autoSort")) {
      await this.showMessage("Imports are sorted.");
      // }
    } catch (error: any) {
      console.log(error);
      return this.showErrorMessage(error.message);
    }
  }

  async findFiles(resolving: string | undefined) {
    return vscode.workspace.findFiles(
      `**/${resolving}.php`,
      //@ts-ignore
      this.config("exclude")
    );
  }

  async findNamespaces(className: string, files: any) {
    const parsedNamespaces = this.parseNamespaces(
      await this.getTextDocuments(files, className),
      className
    );

    if (parsedNamespaces?.length === 0) {
      return this.showMessage(
        `The namspace of the class ${className} is not found.`,
        true
      );
    }

    return parsedNamespaces;
  }

  pickClass(namespaces: any) {
    return new Promise((resolve, reject) => {
      if (namespaces.length === 1) {
        // Only one namespace found so no need to show picker.
        return resolve(namespaces[0]);
      }

      vscode.window.showQuickPick(namespaces).then((picked: any) => {
        if (picked !== undefined) {
          resolve(picked);
        }
      });
    });
  }

  getFileNameFromPath(file: any) {
    return path.parse(file).name;
  }

  getFileDirFromPath(file: any) {
    return path.parse(file).dir;
  }

  async getTextDocuments(files: any, resolving: any) {
    let textDocuments = [];

    for (const file of files) {
      const fileName = this.getFileNameFromPath(file.path);

      if (fileName !== resolving) {
        continue;
      }

      //@ts-ignore
      textDocuments.push(await fs.readFile(file.path));
    }

    return textDocuments;
  }

  parseNamespaces(docs: any, className: string | undefined) {
    let parsedNamespaces: any = [];

    for (const doc of docs) {
      const _namespace: any = Parser.getNamespaceInfo(doc.toString());

      if (_namespace) {
        const fileNameSpace = `${_namespace.name}\\${className}`;

        if (!parsedNamespaces.includes(fileNameSpace)) {
          parsedNamespaces.push(fileNameSpace);
        }
      }
    }

    // If selected text is a built-in php class add that at the beginning.
    if (this.BUILT_IN_CLASSES.includes(className)) {
      parsedNamespaces.unshift(className);
    }

    // If namespace can't be parsed but there is a file with the same
    // name of selected text then assuming it's a global class and
    // add that in the parsedNamespaces array as a global class.
    if (parsedNamespaces?.length === 0 && docs.length > 0) {
      parsedNamespaces.push(className);
    }

    return parsedNamespaces;
  }

  async sortImports() {
    if (this.multiImporting) {
      return;
    }

    const { useStatements } = this.getDeclarations();

    if (useStatements?.length <= 1) {
      throw new Error("Nothing to sort.");
    }

    const sortAlphabetically = this.config("sort") === "alphabet";

    let sortFunction = (a: any, b: any) => {
      const aText = a.text;
      const bText = b.text;

      const aAlias = a.alias || "";
      const bAlias = b.alias || "";

      if (sortAlphabetically) {
        if (aText.toLowerCase() < bText.toLowerCase()) {
          return -1;
        }

        if (aText.toLowerCase() > bText.toLowerCase()) {
          return 1;
        }

        return 0;
      } else {
        if (aText?.length + aAlias?.length === bText?.length + bAlias?.length) {
          if (aText.toLowerCase() < bText.toLowerCase()) {
            return -1;
          }

          if (aText.toLowerCase() > bText.toLowerCase()) {
            return 1;
          }
        }

        return (
          aText?.length + aAlias?.length - (bText?.length + bAlias?.length)
        );
      }
    };

    if (this.config("sort") === "natural") {
      let naturalSortFunc = compare({
        //@ts-ignore
        order: this.config("sortOrder") === "ASC" ? "ASC" : "DESC",
      });

      sortFunction = (a, b) => {
        return naturalSortFunc(a.text, b.text);
      };
    }

    let sorted = useStatements.slice().sort(sortFunction);

    await this.EDITOR?.edit(
      (textEdit) => {
        for (let i = 0; i < sorted.length; i++) {
          const sortItem = sorted[i];
          const item = useStatements[i];

          let itemLength = item.text.length + 4; // 'use '

          if (item.alias) {
            itemLength += item.alias.length + 4; // ' as '
          }

          let sortText = `use ${sortItem.text}`;

          if (sortItem.alias) {
            sortText += ` as ${sortItem.alias}`;
          }

          textEdit.replace(
            new vscode.Range(item.line, 0, item.line, itemLength),
            sortText
          );
        }
      },
      { undoStopBefore: false, undoStopAfter: false }
    );
  }

  hasConflict(useStatements: any, resolving: string): boolean {
    for (const useStatement of useStatements) {
      if (useStatement?.text.endsWith(`\\${resolving}`)) {
        return true;
      }
    }

    return false;
  }

  hasAliasConflict(useStatements: any, resolving: string): boolean {
    for (const useStatement of useStatements) {
      if (useStatement.alias === resolving) {
        return true;
      }
    }

    return false;
  }

  getUseStatementsArray(): Array<any> {
    let useStatements = [];
    const document = this.EDITOR?.document;
    const lineCount = document?.lineCount || 0;

    for (let line = 0; line < lineCount; line++) {
      let text = document?.lineAt(line).text;

      if (text?.startsWith("use ")) {
        let textMatch: any = text.match(/(\w+?);/);
        if (textMatch) {
          //@ts-ignore
          useStatements.push(textMatch[1]);
        }
        //@ts-ignore
      } else if (/(class|trait|interface)\s+\w+/.test(text)) {
        break;
      }
    }

    return useStatements;
  }

  getDeclarations(): any {
    const useStatements: any = [];
    let declarationLines: DeclarationLines = {
      PHPTag: this.CLASS_AST._openTag,
      declare: this.CLASS_AST._declare,
      namespace: this.CLASS_AST._namespace,
      useStatement: this.CLASS_AST._use,
      class: this.CLASS_AST._class,
      trait: this.CLASS_AST._trait,
    };

    //@ts-ignore
    for (const useStatement of declarationLines.useStatement) {
      const item = useStatement.items[0];

      useStatements.push({
        text: item.name,
        alias: item.alias?.name,
        line: useStatement.loc.start.line - 1,
      });
    }

    return { useStatements, declarationLines };
  }

  getInsertLine(declarationLines: DeclarationLines) {
    const _use = declarationLines.useStatement;

    if (_use?.length) {
      return _use[0].loc.start.line - 1;
    }

    const _class = declarationLines.class;

    if (_class) {
      return _class.loc.start.line - 1;
    }

    const namespaceOrTag =
      declarationLines.namespace || declarationLines.PHPTag;

    if (namespaceOrTag) {
      return namespaceOrTag.loc.end.line;
    }
  }

  resolving(selection: vscode.Selection): string | undefined {
    if (typeof selection === "string") {
      return selection;
    }

    let wordRange = this.EDITOR.document.getWordRangeAtPosition(
      selection.active,
      regexWordWithNamespace
    );

    if (wordRange === undefined) {
      return;
    }

    return this.EDITOR?.document.getText(wordRange);
  }

  config(key: string) {
    return vscode.workspace.getConfiguration("phpNamespaceHelper").get(key);
  }

  showMessage(message: string, error = false) {
    if (this.config("showMessageOnStatusBar")) {
      return vscode.window.setStatusBarMessage(message, 3000);
    }

    message = message.replace(/\$\(.+?\)\s\s/, "");

    if (error) {
      vscode.window.showErrorMessage(message);
    } else {
      vscode.window.showInformationMessage(message);
    }
  }

  showErrorMessage(message: string) {
    this.showMessage(message, true);
  }

  async generateNamespaceCommand(returnDontInsert = false, uri?: vscode.Uri) {
    const editor: any = this.EDITOR;
    const currentUri: vscode.Uri = uri || editor?.document.uri;

    let composerFile;
    let psr4;
    let ns: any;

    try {
      composerFile = await findComposerFileByUri(currentUri, returnDontInsert);
      if (!composerFile) {
        return;
      }

      psr4 = await getComposerFileData(composerFile, returnDontInsert);
      ns = await this.createNamespace(
        currentUri,
        {
          psrData: psr4,
          composerFilePath: composerFile,
        },
        returnDontInsert
      );
    } catch (error) {
      if (this.config("useFolderTree")) {
        ns = this.getFileDirFromPath(currentUri.path.replace(this.CWD, ""))
          .replace(/^\//gm, "")
          .replace(/\//g, "\\");
      } else {
        return undefined;
      }
    }

    //@ts-ignore
    this.config("removePath").forEach((regex: any) => {
      ns = ns.replace(new RegExp(regex), "");
    });

    ns = this.config("namespacePrefix") + ns;

    const namespace = "\n" + "namespace " + ns + ";" + "\n";

    if (returnDontInsert) {
      return namespace;
    }

    try {
      const { declarationLines } = this.getDeclarations();

      if (declarationLines.namespace !== null) {
        await editor.edit(
          (textEdit: any) => {
            textEdit.replace(
              Parser.getRangeFromLocation(
                declarationLines.namespace.loc.start,
                declarationLines.namespace.loc.end
              ),
              namespace
            );
          },
          { undoStopBefore: false, undoStopAfter: false }
        );
      } else {
        let line = declarationLines.PHPTag.loc.start.line;

        if (declarationLines.declare !== undefined) {
          line = declarationLines.declare.loc.end.line;
        }

        await editor.edit(
          (textEdit: any) =>
            textEdit.insert(new vscode.Position(line, 0), namespace),
          { undoStopBefore: false, undoStopAfter: false }
        );
      }
    } catch (error: any) {
      await this.showMessage(error.message, true);

      return undefined;
    }
  }

  async createNamespace(
    currentUri: vscode.Uri,
    composer: { psrData?: any; composerFilePath: string },
    ignoreError = true
  ): Promise<any> {
    const currentFilePath = currentUri?.path;
    const composerFileDir = this.getFileDirFromPath(composer.composerFilePath);
    const currentFileDir = this.getFileDirFromPath(currentFilePath);
    const psr4 = composer.psrData;

    let currentRelativePath: any = currentFileDir.replace(
      `${composerFileDir}/`,
      ""
    );

    // this is a way to always match with psr-4 entries
    if (!currentRelativePath.endsWith("/")) {
      currentRelativePath += "/";
    }

    let namespaceBase: any = Object.keys(psr4).find((k) =>
      currentRelativePath.startsWith(psr4[k])
    );

    if (!namespaceBase) {
      if (!ignoreError) {
        await this.showMessage(
          "path parent directory is not found under composer.json autoload object",
          true
        );
      }

      throw new Error();
    }

    const baseDir = psr4[namespaceBase];

    if (baseDir === currentRelativePath) {
      currentRelativePath = null;
    } else {
      currentRelativePath = currentRelativePath
        .replace(baseDir, "")
        .replace(/\/$/g, "")
        .replace(/\//g, "\\");
    }

    namespaceBase = namespaceBase.replace(/\\$/g, "");

    if (!namespaceBase) {
      if (!ignoreError) {
        await this.showMessage(
          "no namespace found for current file parent directory",
          true
        );
      }

      throw new Error();
    }

    let ns: any = null;
    const namespaceBaseLower = namespaceBase.toLowerCase();

    if (!currentRelativePath || currentRelativePath === namespaceBaseLower) {
      // dir already namespaced
      ns = namespaceBase;
    } else {
      // add parent dir/s to base namespace
      ns = `${namespaceBase}\\${currentRelativePath}`;
    }

    return ns.replace(/\\{2,}/g, "\\");
  }
}

export default PhpNamespaceHelper;
