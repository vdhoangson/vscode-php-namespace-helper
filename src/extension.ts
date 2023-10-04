// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import PhpHelper from "./PhpHelper";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const phpHelper = new PhpHelper();

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceHelper.import", async () => {
      if (vscode.window.activeTextEditor?.selections !== undefined) {
        for (const element of vscode.window.activeTextEditor.selections) {
          await phpHelper.importCommand(element);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceHelper.expand", async () => {
      if (vscode.window.activeTextEditor?.selections !== undefined) {
        for (const element of vscode.window.activeTextEditor.selections) {
          await phpHelper.expandCommand(element);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceHelper.sort", () =>
      phpHelper.sortCommand()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceHelper.importAll", () =>
      phpHelper.importAll()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpNamespaceHelper.highlightNotImported",
      () => phpHelper.highlightNotImported()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceHelper.highlightNotUsed", () =>
      phpHelper.highlightNotUsed()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpNamespaceHelper.generateNamespace",
      () => phpHelper.generateNamespace()
    )
  );

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (
        event &&
        event.document.languageId === "php" &&
        vscode.workspace
          .getConfiguration("phpNamespaceHelper")
          .get("sortOnSave")
      ) {
        phpHelper.sortCommand();
      }

      if (
        event &&
        event.document.languageId === "php" &&
        vscode.workspace
          .getConfiguration("phpNamespaceHelper")
          .get("highlightOnSave")
      ) {
        phpHelper.highlightNotImported();
        phpHelper.highlightNotUsed();
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((event) => {
      if (
        event &&
        event.document.languageId === "php" &&
        vscode.workspace
          .getConfiguration("phpNamespaceHelper")
          .get("highlightOnOpen")
      ) {
        phpHelper.highlightNotImported();
        phpHelper.highlightNotUsed();
      }
    })
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  /* TODO document why this function 'deactivate' is empty */
}
