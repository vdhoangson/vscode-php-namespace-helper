// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import PhpResolver from "./PhpResolver";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const phpResolver = new PhpResolver();

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceResolver.import", async () => {
      if (vscode.window.activeTextEditor?.selections !== undefined) {
        for (const element of vscode.window.activeTextEditor.selections) {
          await phpResolver.importCommand(element);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceResolver.expand", async () => {
      if (vscode.window.activeTextEditor?.selections !== undefined) {
        for (const element of vscode.window.activeTextEditor.selections) {
          await phpResolver.expandCommand(element);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceResolver.sort", () =>
      phpResolver.sortCommand()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("phpNamespaceResolver.importAll", () =>
      phpResolver.importAll()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpNamespaceResolver.highlightNotImported",
      () => phpResolver.highlightNotImported()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpNamespaceResolver.highlightNotUsed",
      () => phpResolver.highlightNotUsed()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "phpNamespaceResolver.generateNamespace",
      () => phpResolver.generateNamespace()
    )
  );

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (
        event &&
        event.document.languageId === "php" &&
        vscode.workspace
          .getConfiguration("phpNamespaceResolver")
          .get("sortOnSave")
      ) {
        phpResolver.sortCommand();
      }

      if (
        event &&
        event.document.languageId === "php" &&
        vscode.workspace
          .getConfiguration("phpNamespaceResolver")
          .get("highlightOnSave")
      ) {
        phpResolver.highlightNotImported();
        phpResolver.highlightNotUsed();
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((event) => {
      if (
        event &&
        event.document.languageId === "php" &&
        vscode.workspace
          .getConfiguration("phpNamespaceResolver")
          .get("highlightOnOpen")
      ) {
        phpResolver.highlightNotImported();
        phpResolver.highlightNotUsed();
      }
    })
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  /* TODO document why this function 'deactivate' is empty */
}
