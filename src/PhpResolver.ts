import { Selection } from "vscode";
import { DeclarationLines } from "./interfaces";

let vscode = require("vscode");
let builtInClasses = require("./BuildInClasses");
let naturalSort = require("node-natural-sort");

class PhpResolver {
  regexWordWithNamespace = new RegExp(/[a-zA-Z0-9\\]+/);

  async importCommand(selected: Selection) {
    let resolving = this.resolving(selected);

    if (resolving === undefined) {
      return this.showErrorMessage(`$(issue-opened)  No class is selected.`);
    }

    let fileNameSpace;
    let replaceClassAfterImport = false;

    if (/\\/.test(resolving)) {
      fileNameSpace = resolving.replace(/^\\?/, "");
      replaceClassAfterImport = true;
    } else {
      let files = await this.findFiles(resolving);
      let namespaces = await this.findNamespaces(resolving, files);
      fileNameSpace = await this.pickClass(namespaces);
    }

    this.importClass(selected, fileNameSpace, replaceClassAfterImport);
  }

  /**
   * Import all class
   */
  async importAll() {
    let text = this.activeEditor().document.getText();
    let phpClasses = this.getPhpClasses(text);
    let useStatements = this.getUseStatementsArray();

    for (let phpClass of phpClasses) {
      if (!useStatements.includes(phpClass)) {
        await this.importCommand(phpClass);
      }
    }
  }

  getPhpClasses(text: string) {
    let phpClasses = this.getExtended(text);

    phpClasses = phpClasses.concat(this.getFromFunctionParameters(text));
    phpClasses = phpClasses.concat(this.getInitializedWithNew(text));
    phpClasses = phpClasses.concat(this.getFromStaticCalls(text));
    phpClasses = phpClasses.concat(this.getFromInstanceofOperator(text));

    return phpClasses.filter((v, i, a) => a.indexOf(v) === i);
  }

  getExtended(text: string) {
    let regex = /extends ([A-Z][A-Za-z0-9\-\_]*)/gm;
    let matches: any;
    let phpClasses = [];

    while ((matches = regex.exec(text))) {
      phpClasses.push(matches[1]);
    }

    return phpClasses;
  }

  getFromFunctionParameters(text: string) {
    let regex = /function [\S]+\((.*)\)/gm;
    let matches: any;
    let phpClasses = [];

    while ((matches = regex.exec(text))) {
      let parameters = matches[1].split(", ");

      for (let s of parameters) {
        let phpClassName = s.substr(0, s.indexOf(" "));

        // Starts with capital letter
        if (phpClassName && /[A-Z]/.test(phpClassName[0])) {
          phpClasses.push(phpClassName);
        }
      }
    }

    return phpClasses;
  }

  getInitializedWithNew(text: string) {
    let regex = /new ([A-Z][A-Za-z0-9\-\_]*)/gm;
    let matches: any;
    let phpClasses = [];

    while ((matches = regex.exec(text))) {
      phpClasses.push(matches[1]);
    }

    return phpClasses;
  }

  getFromStaticCalls(text: string) {
    let regex = /([A-Z][A-Za-z0-9\-\_]*)::/gm;
    let matches: any;
    let phpClasses = [];

    while ((matches = regex.exec(text))) {
      phpClasses.push(matches[1]);
    }

    return phpClasses;
  }

  getFromInstanceofOperator(text: string) {
    let regex = /instanceof ([A-Z_][A-Za-z0-9\_]*)/gm;
    let matches: any;
    let phpClasses = [];

    while ((matches = regex.exec(text))) {
      phpClasses.push(matches[1]);
    }

    return phpClasses;
  }

  async highlightNotImported() {
    let text = this.activeEditor().document.getText();
    let phpClasses = this.getPhpClasses(text);
    let importedPhpClasses = this.getImportedPhpClasses(text);

    // Get phpClasses not present in importedPhpClasses
    let notImported = phpClasses.filter(function (phpClass) {
      return !importedPhpClasses.includes(phpClass);
    });

    // Highlight diff
    let matches: any;
    let decorationOptions = [];

    for (const element of notImported) {
      let regex = new RegExp(element, "g");

      while ((matches = regex.exec(text))) {
        let startPos = this.activeEditor().document.positionAt(matches.index);

        // as js does not support regex look behinds we get results
        // where the object name is in the middle of a string
        // we should drop those
        let textLine = this.activeEditor().document.lineAt(startPos);
        let charBeforeMatch = textLine.text.charAt(startPos.character - 1);

        if (
          !/\w/.test(charBeforeMatch) &&
          textLine.text.search(/namespace/) === -1
        ) {
          let endPos = this.activeEditor().document.positionAt(
            matches.index + matches[0].length
          );

          decorationOptions.push({
            range: new vscode.Range(startPos, endPos),
            hoverMessage: "Class is not imported.",
          });
        }
      }
    }

    // TODO have these in settings
    let decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255,155,0, 0.5)",
      light: {
        borderColor: "darkblue",
      },
      dark: {
        borderColor: "lightblue",
      },
    });

    this.activeEditor().setDecorations(decorationType, decorationOptions);
  }

  async highlightNotUsed() {
    const text = this.activeEditor().document.getText();
    const phpClasses = this.getPhpClasses(text);
    const importedPhpClasses = this.getImportedPhpClasses(text);

    // Get phpClasses not present in importedPhpClasses
    let notUsed = importedPhpClasses.filter(function (phpClass) {
      return !phpClasses.includes(phpClass);
    });

    // Highlight diff
    let matches: any;
    let decorationOptions = [];

    for (const element of notUsed) {
      let regex = new RegExp(element, "g");

      while ((matches = regex.exec(text))) {
        let startPos = this.activeEditor().document.positionAt(matches.index);
        let textLine = this.activeEditor().document.lineAt(startPos);

        if (textLine.text.search(/use/) !== -1) {
          let endPos = this.activeEditor().document.positionAt(
            matches.index + matches[0].length
          );

          decorationOptions.push({
            range: new vscode.Range(startPos, endPos),
            hoverMessage: "Class is not used.",
          });
        }
      }
    }

    // TODO have these in settings
    const decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(255,55,55, 0.5)",
      light: {
        borderColor: "darkblue",
      },
      dark: {
        borderColor: "lightblue",
      },
    });

    this.activeEditor().setDecorations(decorationType, decorationOptions);
  }

  getImportedPhpClasses(text: string) {
    let regex = /use (.*);/gm;
    let matches: any;
    let importedPhpClasses = [];

    while ((matches = regex.exec(text))) {
      let className = matches[1].split("\\").pop();

      importedPhpClasses.push(className);
    }

    return importedPhpClasses;
  }

  importClass(
    selected: Selection,
    fileNameSpace: any,
    replaceClassAfterImport = false
  ) {
    let useStatements;
    let declarationLines: DeclarationLines;

    try {
      [useStatements, declarationLines] = this.getDeclarations(fileNameSpace);
    } catch (error: any) {
      return this.showErrorMessage(error.message);
    }

    let classBaseName = fileNameSpace.match(/(\w+)/g).pop();

    if (this.hasConflict(useStatements, classBaseName)) {
      this.insertAsAlias(
        selected,
        fileNameSpace,
        useStatements,
        declarationLines
      );
    } else if (replaceClassAfterImport) {
      this.importAndReplaceSelectedClass(
        selected,
        classBaseName,
        fileNameSpace,
        declarationLines
      );
    } else {
      this.insert(fileNameSpace, declarationLines);
    }
  }

  async insert(
    fileNameSpace: string,
    declarationLines: DeclarationLines,
    alias = null
  ) {
    let [prepend, append, insertLine] = this.getInsertLine(declarationLines);

    await this.activeEditor().edit((textEdit: any) => {
      textEdit.replace(
        new vscode.Position(insertLine, 0),
        `${prepend}use ${fileNameSpace}` +
          (alias !== null ? ` as ${alias}` : "") +
          `;${append}`
      );
    });

    // Auto sort
    if (this.config("autoSort")) {
      this.sortImports();
    }

    this.showMessage("$(check)  The class is imported.");
  }

  async insertAsAlias(
    selection: Selection,
    fileNameSpace: any,
    useStatements: Array<any>,
    declarationLines: DeclarationLines
  ) {
    let alias = await vscode.window.showInputBox({
      placeHolder: "Enter an alias or leave it empty to replace",
    });

    if (alias === undefined) {
      return;
    }

    if (this.hasConflict(useStatements, alias)) {
      this.showErrorMessage(`$(issue-opened)  This alias is already in use.`);

      this.insertAsAlias(
        selection,
        fileNameSpace,
        useStatements,
        declarationLines
      );
    } else if (alias !== "") {
      this.importAndReplaceSelectedClass(
        selection,
        alias,
        fileNameSpace,
        declarationLines,
        alias
      );
    } else if (alias === "") {
      this.replaceUseStatement(fileNameSpace, useStatements);
    }
  }

  async replaceUseStatement(fileNameSpace: any, useStatements: Array<any>) {
    let useStatement = useStatements.find((use: any) => {
      let className = use.text.match(/(\w+)?;/).pop();

      return fileNameSpace.endsWith(className);
    });

    await this.activeEditor().edit((textEdit: any) => {
      textEdit.replace(
        new vscode.Range(
          useStatement.line,
          0,
          useStatement.line,
          useStatement.text.length
        ),
        `use ${fileNameSpace};`
      );
    });

    if (this.config("autoSort")) {
      this.sortImports();
    }
  }

  async replaceNamespaceStatement(namespace: any, line: any) {
    let realLine = line - 1;
    let text = this.activeEditor().document.lineAt(realLine).text;
    let newNs = text.replace(/namespace (.+)/, namespace);

    await this.activeEditor().edit((textEdit: any) => {
      textEdit.replace(
        new vscode.Range(realLine, 0, realLine, text.length),
        newNs.trim()
      );
    });
  }

  async importAndReplaceSelectedClass(
    selection: Selection,
    replacingClassName: any,
    fileNameSpace: any,
    declarationLines: DeclarationLines,
    alias = null
  ) {
    await this.changeSelectedClass(selection, replacingClassName, false);

    this.insert(fileNameSpace, declarationLines, alias);
  }

  async expandCommand(selection: Selection) {
    let resolving = this.resolving(selection);

    if (resolving === null) {
      return this.showErrorMessage(`$(issue-opened)  No class is selected.`);
    }

    let files = await this.findFiles(resolving);
    let namespaces = await this.findNamespaces(resolving, files);
    let fileNameSpace = await this.pickClass(namespaces);

    this.changeSelectedClass(selection, fileNameSpace, true);
  }

  async changeSelectedClass(
    selection: Selection,
    fileNameSpace: any,
    prependBackslash = false
  ) {
    await this.activeEditor().edit((textEdit: any) => {
      textEdit.replace(
        this.activeEditor().document.getWordRangeAtPosition(
          selection.active,
          this.regexWordWithNamespace
        ),
        (prependBackslash && this.config("leadingSeparator") ? "\\" : "") +
          fileNameSpace
      );
    });

    let newPosition = new vscode.Position(
      selection.active.line,
      selection.active.character
    );

    this.activeEditor().selection = new vscode.Selection(
      newPosition,
      newPosition
    );
  }

  sortCommand() {
    try {
      this.sortImports();
    } catch (error: any) {
      return this.showErrorMessage(error.message);
    }

    this.showMessage("$(check)  Imports are sorted.");
  }

  findFiles(resolving: string | undefined): any {
    return vscode.workspace.findFiles(
      `**/${resolving}.php`,
      this.config("exclude")
    );
  }

  findNamespaces(resolving: string | undefined, files: Array<any>) {
    return new Promise((resolve, reject) => {
      let textDocuments = this.getTextDocuments(files, resolving);

      Promise.all(textDocuments).then((docs) => {
        let parsedNamespaces = this.parseNamespaces(docs, resolving);

        if (parsedNamespaces.length === 0) {
          return this.showErrorMessage(
            `$(circle-slash)  The class is not found.`
          );
        }

        resolve(parsedNamespaces);
      });
    });
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

  getTextDocuments(files: Array<any>, resolving: string | undefined) {
    let textDocuments = [];

    for (const element of files) {
      let fileName = element.fsPath.replace(/^.*[\\\/]/, "").split(".")[0];

      if (fileName !== resolving) {
        continue;
      }

      textDocuments.push(vscode.workspace.openTextDocument(element));
    }

    return textDocuments;
  }

  parseNamespaces(docs: any, resolving: string | undefined) {
    let parsedNamespaces: any = [];

    for (const element of docs) {
      for (let line = 0; line < element.lineCount; line++) {
        let textLine = element.lineAt(line).text;

        if (
          textLine.startsWith("namespace ") ||
          textLine.startsWith("<?php namespace ")
        ) {
          let namespace = textLine
            .match(/^(namespace|(<\?php namespace))\s+(.+)?;/)
            .pop();
          let fileNameSpace = `${namespace}\\${resolving}`;

          if (!parsedNamespaces.includes(fileNameSpace)) {
            parsedNamespaces.push(fileNameSpace);
            break;
          }
        }
      }
    }

    // If selected text is a built-in php class add that at the beginning.
    if (builtInClasses.includes(resolving)) {
      parsedNamespaces.unshift(resolving);
    }

    // If namespace can't be parsed but there is a file with the same
    // name of selected text then assuming it's a global class and
    // add that in the parsedNamespaces array as a global class.
    if (parsedNamespaces.length === 0 && docs.length > 0) {
      parsedNamespaces.push(resolving);
    }

    return parsedNamespaces;
  }

  sortImports(): void {
    let [useStatements] = this.getDeclarations();

    if (useStatements.length <= 1) {
      throw new Error("$(issue-opened)  Nothing to sort.");
    }

    let sortFunction = (a: any, b: any) => {
      if (this.config("sortAlphabetically")) {
        if (a.text.toLowerCase() < b.text.toLowerCase()) {
          return -1;
        }
        if (a.text.toLowerCase() > b.text.toLowerCase()) {
          return 1;
        }
        return 0;
      } else {
        if (a.text.length === b.text.length) {
          if (a.text.toLowerCase() < b.text.toLowerCase()) {
            return -1;
          }
          if (a.text.toLowerCase() > b.text.toLowerCase()) {
            return 1;
          }
        }

        return a.text.length - b.text.length;
      }
    };

    if (this.config("sortNatural")) {
      let natsort = naturalSort({
        caseSensitive: true,
        order: this.config("sortAlphabetically") ? "ASC" : "DESC",
      });

      sortFunction = (a, b) => {
        return natsort(a.text, b.text);
      };
    }

    let sorted = useStatements.slice().sort(sortFunction);

    this.activeEditor().edit((textEdit: any) => {
      for (let i = 0; i < sorted.length; i++) {
        textEdit.replace(
          new vscode.Range(
            useStatements[i].line,
            0,
            useStatements[i].line,
            useStatements[i].text.length
          ),
          sorted[i].text
        );
      }
    });
  }

  activeEditor() {
    return vscode.window.activeTextEditor;
  }

  hasConflict(useStatements: any, resolving: string) {
    for (const element of useStatements) {
      if (element.text.match(/(\w+)?;/).pop() === resolving) {
        return true;
      }
    }

    return false;
  }

  getUseStatementsArray(): Array<any> {
    let useStatements = [];

    for (let line = 0; line < this.activeEditor().document.lineCount; line++) {
      let text = this.activeEditor().document.lineAt(line).text;

      if (text.startsWith("use ")) {
        useStatements.push(text.match(/(\w+?);/)[1]);
      } else if (/(class|trait|interface)\s+\w+/.test(text)) {
        break;
      }
    }

    return useStatements;
  }

  getDeclarations(pickedClass = null): Array<any> {
    let useStatements = [];
    let declarationLines: DeclarationLines = {
      PHPTag: 0,
      namespace: null,
      useStatement: null,
      class: null,
    };

    for (let line = 0; line < this.activeEditor().document.lineCount; line++) {
      let text = this.activeEditor().document.lineAt(line).text;

      if (pickedClass !== null && text === `use ${pickedClass};`) {
        throw new Error("$(issue-opened)  The class is already imported.");
      }

      // break if all declarations were found.
      if (
        declarationLines.PHPTag &&
        declarationLines.namespace &&
        declarationLines.useStatement &&
        declarationLines.class
      ) {
        break;
      }

      if (text.startsWith("<?php")) {
        declarationLines.PHPTag = line + 1;
      } else if (
        text.startsWith("namespace ") ||
        text.startsWith("<?php namespace")
      ) {
        declarationLines.namespace = line + 1;
      } else if (text.startsWith("use ")) {
        useStatements.push({ text, line });
        declarationLines.useStatement = line + 1;
      } else if (/(class|trait|interface)\s+\w+/.test(text)) {
        declarationLines.class = line + 1;
      }
    }

    return [useStatements, declarationLines];
  }

  getInsertLine(declarationLines: DeclarationLines) {
    let prepend = declarationLines.PHPTag === 0 ? "" : "\n";
    let append = "\n";
    let insertLine = declarationLines.PHPTag;

    if (prepend === "" && declarationLines.namespace !== null) {
      prepend = "\n";
    }

    if (declarationLines.useStatement !== null) {
      prepend = "";
      insertLine = declarationLines.useStatement;
    } else if (declarationLines.namespace !== null) {
      insertLine = declarationLines.namespace;
    }

    if (
      declarationLines.class !== null &&
      (declarationLines.class - declarationLines.useStatement <= 1 ||
        declarationLines.class - declarationLines.namespace <= 1 ||
        declarationLines.class - declarationLines.PHPTag <= 1)
    ) {
      append = "\n\n";
    }

    return [prepend, append, insertLine];
  }

  resolving(selection: Selection): string | undefined {
    if (typeof selection === "string") {
      return selection;
    }

    let wordRange = this.activeEditor().document.getWordRangeAtPosition(
      selection.active,
      this.regexWordWithNamespace
    );

    if (wordRange === undefined) {
      return;
    }

    return this.activeEditor().document.getText(wordRange);
  }

  config(key: string) {
    return vscode.workspace.getConfiguration("phpNamespaceResolver").get(key);
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

  async generateNamespace() {
    let currentUri = this.activeEditor().document.uri;
    let currentFile = currentUri.path;
    let currentPath = currentFile.substr(0, currentFile.lastIndexOf("/"));

    let workspaceFolder = vscode.workspace.getWorkspaceFolder(currentUri);

    if (workspaceFolder === undefined) {
      return this.showErrorMessage(
        "No folder opened in workspace, cannot find composer.json"
      );
    }

    //try to retrieve composer file by searching recursively into parent folders of the current file

    let composerFile;
    let composerPath = currentFile;

    do {
      composerPath = composerPath.substr(0, composerPath.lastIndexOf("/"));
      composerFile = await vscode.workspace.findFiles(
        new vscode.RelativePattern(composerPath, "composer.json")
      );
    } while (!composerFile.length && composerPath !== workspaceFolder.uri.path);

    if (!composerFile.length) {
      return this.showErrorMessage(
        "No composer.json file found, automatic namespace generation failed"
      );
    }

    composerFile = composerFile.pop().path;

    vscode.workspace
      .openTextDocument(composerFile)
      .then((document: { getText: () => string }) => {
        let composerJson = JSON.parse(document.getText());
        let psr4 = (composerJson.autoload || {})["psr-4"];

        if (psr4 === undefined) {
          return this.showErrorMessage(
            "No psr-4 key in composer.json autoload object, automatic namespace generation failed"
          );
        }

        let devPsr4 = (composerJson["autoload-dev"] || {})["psr-4"];

        if (devPsr4 !== undefined) {
          psr4 = { ...psr4, ...devPsr4 };
        }

        let currentRelativePath = currentPath.split(composerPath)[1];

        //this is a way to always match with psr-4 entries
        if (!currentRelativePath.endsWith("/")) {
          currentRelativePath += "/";
        }

        let namespaceBase = Object.keys(psr4).filter(function (namespaceBase) {
          return currentRelativePath.lastIndexOf(psr4[namespaceBase]) !== -1;
        })[0];

        let baseDir = psr4[namespaceBase];

        namespaceBase = namespaceBase.replace(/\\$/, "");

        let namespace = currentPath.substring(
          currentPath.lastIndexOf(baseDir) + baseDir.length
        );

        if (namespace !== "") {
          namespace = namespace.replace(/\//g, "\\");
          namespace = namespace.replace(/^\\/, "");
          namespace = namespace.replace(/\\$/, "");
          namespace = namespaceBase + "\\" + namespace;
        } else {
          namespace = namespaceBase;
        }

        namespace = "namespace " + namespace + ";" + "\n";

        let declarationLines: DeclarationLines;

        try {
          [, declarationLines] = this.getDeclarations();
        } catch (error: any) {
          return this.showErrorMessage(error.message);
        }

        if (declarationLines.namespace !== null) {
          this.replaceNamespaceStatement(namespace, declarationLines.namespace);
        } else {
          this.activeEditor().edit((textEdit: any) => {
            textEdit.insert(new vscode.Position(1, 0), namespace);
          });
        }
      });
  }
}

export default PhpResolver;
