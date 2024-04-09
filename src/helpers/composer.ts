import * as vscode from "vscode";
import * as fs from "fs-extra";
const findUp = import("find-up");

export async function findComposerFileByUri(
  currentUri: vscode.Uri,
  ignoreError = true
): Promise<string | undefined> {
  const composerFile = (await findUp).findUp("composer.json", { cwd: currentUri.path });

  if (!composerFile) {
    if (!ignoreError) {
      await vscode.window.showErrorMessage("No composer.json file found");
    }

    throw new Error();
  }

  return composerFile;
}

export async function getComposerFileData(
  composerFile: string,
  ignoreError = true
): Promise<any> {
  const composerJson = await fs.readJson(composerFile);
  let psr4;

  try {
    psr4 = composerJson["autoload"]["psr-4"];
  } catch (error) {
    if (!ignoreError) {
      await vscode.window.showErrorMessage(
        "No psr-4 key in composer.json autoload object"
      );
    }

    throw new Error();
  }

  let devPsr4: any = undefined;

  try {
    devPsr4 = composerJson["autoload-dev"]["psr-4"];
  } catch (error) {}

  if (devPsr4 !== undefined) {
    psr4 = { ...psr4, ...devPsr4 };
  }

  return psr4;
}
