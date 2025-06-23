# Changes Made to Update the Extension

The following changes were made to update the PHP Namespace Helper extension to be compatible with the latest version of VS Code:

1. Updated the VS Code engine version requirement from `^1.68.0` to `^1.85.0` and added `vscode.api` version

2. Updated activation events:

   - Removed unnecessary activation events for commands as VS Code now automatically generates these
   - Kept only the essential `onLanguage:php` activation event

3. Fixed TypeScript type issues:

   - Added proper return types to methods
   - Updated method return signatures to handle multiple return types correctly
   - Added explicit type annotations where they were missing

4. Renamed properties to follow camelCase convention:

   - Changed `BUILT_IN_CLASSES` to `builtInClasses`
   - Changed `EDITOR` to `editor`
   - Changed `CLASS_AST` to `classAst`
   - Changed `CWD` to `cwd`
   - Changed `PHPTag` to `phpTag` in the interface and all usages

5. Updated all dependencies to their latest versions

6. Fixed ESLint warnings and errors

7. Added proper clean-up in the `deactivate` function

8. Updated the README to reflect compatibility with VS Code 1.85.0+

9. Incremented the extension version from 1.1.6 to 1.2.0

These changes ensure that the extension is compatible with the latest VS Code features and follows modern TypeScript and VS Code extension development best practices.

# Changelog

## Version 1.3.0 (June 23, 2025)

### Added

- New feature: Highlight unimported classes with a customizable red background
- Added theme color for unimported class highlighting
- Added setting to enable/disable highlighting of unimported classes

### Updated

- Improved diagnostic handling for PHP files
- Added documentation for new features in README.md

## Version 1.2.0 (Previous Update)

The following changes were made to update the PHP Namespace Helper extension to be compatible with the latest version of VS Code:

1. Updated the VS Code engine version requirement from `^1.68.0` to `^1.85.0` and added `vscode.api` version

2. Updated activation events:

   - Removed unnecessary activation events for commands as VS Code now automatically generates these
   - Kept only the essential `onLanguage:php` activation event

3. Fixed TypeScript type issues:

   - Added proper return types to methods
   - Updated method return signatures to handle multiple return types correctly
   - Added explicit type annotations where they were missing

4. Renamed properties to follow camelCase convention:

   - Changed `BUILT_IN_CLASSES` to `builtInClasses`
   - Changed `EDITOR` to `editor`
   - Changed `CLASS_AST` to `classAst`
   - Changed `CWD` to `cwd`
   - Changed `PHPTag` to `phpTag` in the interface and all usages

5. Updated all dependencies to their latest versions

6. Fixed ESLint warnings and errors

7. Added proper clean-up in the `deactivate` function

8. Updated the README to reflect compatibility with VS Code 1.85.0+

9. Incremented the extension version from 1.1.6 to 1.2.0

These changes ensure that the extension is compatible with the latest VS Code features and follows modern TypeScript and VS Code extension development best practices.
