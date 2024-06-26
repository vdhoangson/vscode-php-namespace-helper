// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import PhpNamespaceHelper from "./PhpNamespaceHelper";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const createDiagnosticCollection =
    vscode.languages.createDiagnosticCollection("phpNamespaceHelper");

  context.subscriptions.push(createDiagnosticCollection);

  const phpNamespaceHelper = new PhpNamespaceHelper();

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceHelper.import", async () => {
      if (vscode.window.activeTextEditor?.selections !== undefined) {
        phpNamespaceHelper.setEditorAndAST();
        for (const element of vscode.window.activeTextEditor.selections) {
          await phpNamespaceHelper.importCommand(element);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceHelper.expand", async () => {
      if (vscode.window.activeTextEditor?.selections !== undefined) {
        for (const element of vscode.window.activeTextEditor.selections) {
          await phpNamespaceHelper.expandCommand(element);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpNamespaceHelper.sort",
      async () => await phpNamespaceHelper.sortCommand()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpNamespaceHelper.importAll",
      async () => await phpNamespaceHelper.importAllCommand()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpNamespaceHelper.generateNamespace",
      async () => await phpNamespaceHelper.generateNamespaceCommand()
    )
  );

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(async (event) => {
      if (
        event &&
        event.document.languageId === "php" &&
        vscode.workspace
          .getConfiguration("phpNamespaceHelper")
          .get("sortOnSave")
      ) {
        await phpNamespaceHelper.sortCommand();
      }
    })
  );

  return {
    getNamespace(uri?: vscode.Uri) {
      return phpNamespaceHelper.generateNamespaceCommand(true, uri);
    },
    insertNamespace() {
      return phpNamespaceHelper.generateNamespaceCommand();
    },
  };
}

// This method is called when your extension is deactivated
export function deactivate() {
  /* TODO document why this function 'deactivate' is empty */
}
