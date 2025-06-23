/* eslint-disable @typescript-eslint/naming-convention */
import * as PhpParser from "php-parser";
import * as vscode from "vscode";

/**
 * PHP Parser engine configuration with improved settings for robustness
 *
 * - debug: false for better performance
 * - locations: true to track line/column positions
 * - extractDoc: true to extract PHPDoc comments
 * - extractTokens: true to get token information
 * - suppressErrors: true to continue parsing despite syntax errors
 * - ast.withPositions: true to include position info in AST nodes
 */
const Parser = new PhpParser.Engine({
  parser: {
    debug: false,
    locations: true,
    extractDoc: true,
    extractTokens: true,
    suppressErrors: true,
  },
  ast: {
    withPositions: true,
  },
});

/**
 * AST node location type definition
 */
export interface ASTLocation {
  line: number;
  column: number;
}

/**
 * AST location range
 */
export interface ASTLocationRange {
  start: ASTLocation;
  end: ASTLocation;
}

/**
 * Extract class AST structure from PHP content
 * @param content PHP file content
 * @returns Structured AST data with key PHP elements
 */
export function buildClassASTFromContent(content: string) {
  if (!content) {
    return createEmptyASTStructure();
  }

  try {
    const AST = Parser.parseCode(content, "*.php");
    if (!AST) {
      return createEmptyASTStructure();
    }

    // Find PHP open tag
    const _tag: any = AST.tokens?.find(
      (item: any) => item[0] === "T_OPEN_TAG"
    ) || [null, null, 1, 0, 0];

    // Find declare statement
    const _declare: any = AST.children?.find(
      (item: any) => item?.kind === "declare"
    );

    // Find namespace declaration
    const _namespace: any = AST.children?.find(
      (item: any) => item?.kind === "namespace"
    );

    // Get container (namespace or global scope)
    const container = _namespace || AST;

    // Find use statements
    const _use: any[] =
      container.children?.filter((item: any) => item?.kind === "usegroup") ||
      [];

    // Find class, enum, interface, or trait declaration
    const _class: any = container.children?.find(
      (item: any) =>
        item && ["class", "enum", "interface", "trait"].includes(item.kind)
    );

    // Find trait usage within the class
    const _trait: any =
      _class && Array.isArray(_class.body)
        ? _class.body.find((item: any) => item?.kind === "traituse")?.traits
        : null;

    return {
      _openTag: {
        loc: {
          start: {
            line: _tag[2] || 1,
            column: _tag[3] || 0,
          },
          end: {
            line: _tag[2] || 1,
            column: _tag[4] || 0,
          },
        },
      },
      _declare: _declare,
      _namespace: _namespace
        ? getNamespaceLocation(_namespace, _use[0] || _class)
        : null,
      _class: _class,
      _use: _use,
      _trait: _trait,
    };
  } catch (error: any) {
    console.error("Error parsing PHP code:", error);
    return createEmptyASTStructure();
  }
}

/**
 * Creates an empty AST structure to return on parsing errors
 */
function createEmptyASTStructure() {
  return {
    _openTag: {
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    },
    _declare: null,
    _namespace: null,
    _class: null,
    _use: [],
    _trait: null,
  };
}

/**
 * Extract namespace information from PHP content
 * @param content PHP file content
 * @returns Namespace node or null if not found
 */
export function getNamespaceInfo(content: string) {
  if (!content) {
    return null;
  }

  try {
    const AST = Parser.parseCode(content, "*.php");
    if (!AST || !Array.isArray(AST.children)) {
      return null;
    }

    return AST.children.find((item: any) => item?.kind === "namespace");
  } catch (error) {
    console.error("Error getting namespace info:", error);
    return null;
  }
}

/**
 * Calculate the namespace location based on start and end nodes
 * @param start Namespace node
 * @param end Next node after namespace declarations
 * @returns Location object with start and end positions
 */
function getNamespaceLocation(start: any, end: any) {
  // Handle missing or invalid start location
  if (!start || !start.loc || !start.loc.start) {
    return {
      loc: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 0 },
      },
    };
  }

  // Handle missing end node
  if (!end) {
    return {
      loc: {
        start: start.loc.start,
        end: {
          line: start.loc.end.line + 1,
          column: 0,
        },
      },
    };
  }

  // Determine end line based on leading comments or node start
  const line =
    end.leadingComments &&
    Array.isArray(end.leadingComments) &&
    end.leadingComments.length > 0
      ? end.leadingComments[0].loc?.start?.line || end.loc.start.line
      : end.loc?.start?.line || start.loc.end.line + 1;

  return {
    loc: {
      start: start.loc.start,
      end: { line, column: 0 },
    },
  };
}

/**
 * Convert AST location to VS Code Range
 * @param start Start location (line, column)
 * @param end End location (line, column)
 * @returns VS Code Range object
 */
export function getRangeFromLocation(
  start: { line: number; column: number },
  end: { line: number; column: number }
): vscode.Range {
  // Ensure line and column are valid numbers (>=0)
  const startLine = Math.max(0, (start.line || 1) - 1);
  const startColumn = Math.max(0, start.column || 0);
  const endLine = Math.max(0, (end.line || 1) - 1);
  const endColumn = Math.max(0, end.column || 0);

  return new vscode.Range(
    new vscode.Position(startLine, startColumn),
    new vscode.Position(endLine, endColumn)
  );
}

/**
 * Detect the type of PHP file (class, interface, trait, enum)
 * @param content PHP file content
 * @returns File type or null if not found
 */
export function detectPhpFileType(content: string): string | null {
  if (!content) {
    return null;
  }

  try {
    const AST = Parser.parseCode(content, "*.php");
    if (!AST || !Array.isArray(AST.children)) {
      return null;
    }

    // Find declaration in either namespace or root
    const findInChildren = (children: any[]): string | null => {
      if (!children || !Array.isArray(children)) {
        return null;
      }

      for (const item of children) {
        if (!item || typeof item !== "object") {
          continue;
        }

        if (item.kind === "class") {
          return "class";
        }
        if (item.kind === "interface") {
          return "interface";
        }
        if (item.kind === "trait") {
          return "trait";
        }
        if (item.kind === "enum") {
          return "enum";
        }
      }

      return null;
    };

    // Look in namespace first if it exists
    const namespace: any = AST.children.find(
      (item: any) => item?.kind === "namespace"
    );
    if (namespace && Array.isArray(namespace.children)) {
      const typeInNamespace = findInChildren(namespace.children);
      if (typeInNamespace) {
        return typeInNamespace;
      }
    }

    // Look in root if not found in namespace
    return findInChildren(AST.children);
  } catch (error) {
    console.error("Error detecting PHP file type:", error);
    return null;
  }
}

/**
 * Interface for use statement information
 */
export interface UseStatement {
  /** Full qualified name */
  name: string;
  /** Alias for the import if specified */
  alias?: string;
  /** Line number where the use statement appears */
  line: number;
  /** Original source code */
  source?: string;
}

/**
 * Extract use statements from PHP content
 * @param content PHP file content
 * @returns Array of use statements with name, alias, and position information
 */
export function extractUseStatements(content: string): UseStatement[] {
  if (!content) {
    return [];
  }

  try {
    const AST = Parser.parseCode(content, "*.php");
    if (!AST || !Array.isArray(AST.children)) {
      return [];
    }

    const result: UseStatement[] = [];

    // Process use group nodes to extract use statements
    const processUseGroups = (items: any[]) => {
      if (!items || !Array.isArray(items)) {
        return;
      }

      for (const item of items) {
        if (
          item?.kind === "usegroup" &&
          item.items &&
          Array.isArray(item.items)
        ) {
          for (const useItem of item.items) {
            if (useItem?.name) {
              // Extract source code for the use statement if possible
              let source = "";
              if (item.loc && content) {
                try {
                  const startLine = item.loc.start.line - 1;
                  const endLine = item.loc.end.line - 1;
                  const lines = content.split("\n");
                  const sourceLines = lines.slice(startLine, endLine + 1);
                  source = sourceLines.join("\n");
                } catch (e) {
                  // Ignore extraction errors
                }
              }

              result.push({
                name: useItem.name,
                alias: useItem.alias?.name,
                line: item.loc?.start?.line || 0,
                source,
              });
            }
          }
        }
      }
    };

    // Check in namespace
    const namespace: any = AST.children.find(
      (item: any) => item?.kind === "namespace"
    );
    if (namespace?.children && Array.isArray(namespace.children)) {
      processUseGroups(namespace.children);
    }

    // Check in root
    processUseGroups(AST.children);

    return result;
  } catch (error) {
    console.error("Error extracting use statements:", error);
    return [];
  }
}

/**
 * Interface for namespace information
 */
export interface NamespaceInfo {
  /** Namespace name */
  name: string;
  /** Start line number */
  start: number;
  /** End line number */
  end: number;
  /** Whether the namespace uses brackets */
  hasBrackets?: boolean;
}

/**
 * Extract namespace information from PHP content
 * @param content PHP file content
 * @returns Namespace information or null if not found
 */
export function extractNamespace(content: string): NamespaceInfo | null {
  if (!content) {
    return null;
  }

  try {
    const AST = Parser.parseCode(content, "*.php");
    if (!AST || !Array.isArray(AST.children)) {
      return null;
    }

    const namespace: any = AST.children.find(
      (item: any) => item?.kind === "namespace"
    );

    if (namespace?.name && namespace.loc?.start && namespace.loc?.end) {
      return {
        name: namespace.name,
        start: namespace.loc.start.line,
        end: namespace.loc.end.line,
        hasBrackets: namespace.withBrackets === true,
      };
    }

    return null;
  } catch (error) {
    console.error("Error extracting namespace:", error);
    return null;
  }
}

/**
 * Interface for parsed class name components
 */
export interface ParsedClassName {
  /** Namespace part of the fully qualified name */
  namespace: string;
  /** Class name part of the fully qualified name */
  className: string;
  /** Full qualified name including namespace and class */
  fullName: string;
  /** Whether the name starts with a leading backslash */
  isAbsolute: boolean;
}

/**
 * Parse a fully qualified class name into namespace and class components
 * @param fullyQualifiedName Fully qualified class name
 * @returns Object with namespace and class name components
 */
export function parseFullyQualifiedClassName(
  fullyQualifiedName: string
): ParsedClassName {
  if (!fullyQualifiedName) {
    return {
      namespace: "",
      className: "",
      fullName: "",
      isAbsolute: false,
    };
  }

  // Check if name is absolute (starts with backslash)
  const isAbsolute = fullyQualifiedName.startsWith("\\");

  // Remove leading backslash if present
  const name = isAbsolute
    ? fullyQualifiedName.substring(1)
    : fullyQualifiedName;

  // Find the last backslash position
  const lastBackslashPos = name.lastIndexOf("\\");

  if (lastBackslashPos === -1) {
    // No namespace
    return {
      namespace: "",
      className: name,
      fullName: name,
      isAbsolute,
    };
  }

  const namespace = name.substring(0, lastBackslashPos);
  const className = name.substring(lastBackslashPos + 1);

  return {
    namespace,
    className,
    fullName: name,
    isAbsolute,
  };
}

/**
 * Interface for a class reference found in code
 */
export interface ClassReference {
  /** Class name without namespace */
  name: string;
  /** Start position in document */
  start: vscode.Position;
  /** End position in document */
  end: vscode.Position;
  /** Full reference text as it appears in code */
  text: string;
  /** Whether the class is already fully qualified */
  isQualified: boolean;
  /** Whether the class is in a comment */
  inComment: boolean;
  /** The namespace context where this reference appears */
  contextNamespace?: string;
}

/**
 * Find all class references in a PHP document
 * @param document VS Code document
 * @returns Array of class references
 */
export function findClassReferences(
  document: vscode.TextDocument
): ClassReference[] {
  const text = document.getText();
  if (!text) {
    return [];
  }

  const references: ClassReference[] = [];
  const namespace = extractNamespace(text);
  const useStatements = extractUseStatements(text);

  try {
    // Parse the document for PHP structure
    const AST = Parser.parseCode(text, "*.php");
    if (!AST) {
      return [];
    }

    // Extract tokens with potential class references
    const classTokenRegex =
      /^T_(NAME|STRING|VARIABLE|CONSTANT_ENCAPSED_STRING)$/;
    const tokens: any[] =
      AST.tokens?.filter(
        (token: any) => Array.isArray(token) && classTokenRegex.test(token[0])
      ) || [];

    // Process each token to identify class references
    for (const token of tokens) {
      if (!Array.isArray(token) || token.length < 5) {
        continue;
      }

      const [type, value, line, startColumn, endColumn] = token as [
        string,
        string,
        number,
        number,
        number
      ];

      // Skip if not a potential class name (must start with uppercase letter)
      if (typeof value !== "string" || !/^[A-Z][a-zA-Z0-9_]*$/.test(value)) {
        continue;
      }

      // Create position objects
      const start = new vscode.Position(line - 1, startColumn);
      const end = new vscode.Position(line - 1, endColumn);

      // Check if already imported
      const isImported = useStatements.some(
        (use) => use.alias === value || use.name.endsWith(`\\${value}`)
      );

      // Check if in comment
      const lineText = document.lineAt(line - 1).text;
      const inComment =
        lineText.substring(0, startColumn).includes("//") ||
        lineText.substring(0, startColumn).includes("*");

      if (!isImported) {
        references.push({
          name: value,
          start,
          end,
          text: value,
          isQualified: false,
          inComment,
          contextNamespace: namespace?.name,
        });
      }
    }

    return references;
  } catch (error) {
    console.error("Error finding class references:", error);
    return [];
  }
}

/**
 * Check if a class name is already imported via use statements
 * @param className Class name to check
 * @param useStatements Array of use statements
 * @returns True if the class is already imported
 */
export function isClassImported(
  className: string,
  useStatements: UseStatement[]
): boolean {
  if (!className || !useStatements || !Array.isArray(useStatements)) {
    return false;
  }

  // Parse the class name if it's fully qualified
  const parsed = parseFullyQualifiedClassName(className);
  const shortName = parsed.className;

  return useStatements.some((use) => {
    // Check if it matches an alias
    if (use.alias === shortName) {
      return true;
    }

    // Check if it matches the name part of a use statement
    const useParsed = parseFullyQualifiedClassName(use.name);
    return useParsed.className === shortName;
  });
}

/**
 * Get a list of all unimported classes in a PHP document
 * @param document VS Code document
 * @returns Array of unimported class references
 */
export function getUnimportedClasses(
  document: vscode.TextDocument
): ClassReference[] {
  if (!document) {
    return [];
  }

  const text = document.getText();
  const useStatements = extractUseStatements(text);
  const classReferences = findClassReferences(document);

  // Filter out classes that are already imported
  return classReferences.filter(
    (ref) => !isClassImported(ref.name, useStatements)
  );
}

/**
 * Interface for PHP class information
 */
export interface PhpClassInfo {
  /** Class name */
  name: string;
  /** Class namespace */
  namespace: string;
  /** Full qualified name */
  fqn: string;
  /** Type (class, interface, trait, enum) */
  type: string;
  /** Start line number */
  startLine: number;
  /** End line number */
  endLine: number;
}

/**
 * Extract class information from PHP content
 * @param content PHP file content
 * @returns Class information or null if not found
 */
export function extractClassInfo(content: string): PhpClassInfo | null {
  if (!content) {
    return null;
  }

  try {
    const AST = Parser.parseCode(content, "*.php");
    if (!AST || !Array.isArray(AST.children)) {
      return null;
    }

    // Get namespace if exists
    const namespaceNode: any = AST.children.find(
      (item: any) => item?.kind === "namespace"
    );
    const namespaceName = namespaceNode?.name || "";

    // Find class declaration in namespace or root
    const findClass = (nodes: any[]): [any, string] | null => {
      if (!nodes || !Array.isArray(nodes)) {
        return null;
      }

      for (const node of nodes) {
        if (!node || typeof node !== "object") {
          continue;
        }

        if (["class", "interface", "trait", "enum"].includes(node.kind)) {
          return [node, node.kind];
        }
      }

      return null;
    };

    // Look in namespace or root
    const classResult = findClass(namespaceNode?.children || AST.children);
    if (!classResult) {
      return null;
    }

    const [classNode, classType] = classResult;
    if (!classNode?.name || !classNode.loc) {
      return null;
    }

    return {
      name: classNode.name,
      namespace: namespaceName,
      fqn: namespaceName
        ? `${namespaceName}\\${classNode.name}`
        : classNode.name,
      type: classType,
      startLine: classNode.loc.start.line,
      endLine: classNode.loc.end.line,
    };
  } catch (error) {
    console.error("Error extracting class info:", error);
    return null;
  }
}

/**
 * Find a suitable position to insert a new use statement
 * @param content PHP file content
 * @returns Line number to insert a new use statement
 */
export function findUseStatementInsertPosition(content: string): number {
  if (!content) {
    return 2; // Default after <?php
  }

  try {
    const ast = buildClassASTFromContent(content);

    // If we have existing use statements, add after the last one
    if (ast._use && ast._use.length > 0) {
      const lastUse = ast._use[ast._use.length - 1];
      if (lastUse && lastUse.loc && lastUse.loc.end) {
        return lastUse.loc.end.line + 1;
      }
    }

    // If we have a namespace, add after it
    if (ast._namespace) {
      return ast._namespace.loc.end.line + 1;
    }

    // If we have a declare statement, add after it
    if (ast._declare) {
      return ast._declare.loc.end.line + 1;
    }

    // Otherwise, add after the PHP open tag
    if (ast._openTag) {
      return ast._openTag.loc.end.line + 1;
    }

    return 2; // Default after <?php
  } catch (error) {
    console.error("Error finding use statement insert position:", error);
    return 2; // Default after <?php
  }
}

/**
 * Checks if a string represents a built-in PHP class
 * @param className Name of the class to check
 * @returns True if the class is a PHP built-in
 */
export function isPhpBuiltInClass(className: string): boolean {
  if (!className) {
    return false;
  }

  // Import the list from BuildInClasses.ts
  const builtInClasses = require("./BuildInClasses").default;

  return builtInClasses.includes(className);
}
