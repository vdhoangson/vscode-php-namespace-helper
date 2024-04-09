export function getFromFunctionParameters(_class: any) {
  const methods = _class.body?.filter(
    (item: any) => item.kind === "method" && item.arguments.length
  );

  return methods?.map((item: any) =>
    item.arguments
      .filter(
        (arg: any) =>
          arg?.type?.kind === "name" && arg?.type?.resolution === "uqn"
      )
      .map((arg: any) => arg?.type?.name)
  );
}

export function getInitializedWithNew(text: string) {
  const regex = /new ([A-Z][A-Za-z0-9\-_]*)/gm;
  let matches: any = [];
  const phpClasses: any = [];

  while ((matches = regex.exec(text))) {
    phpClasses.push(matches[1]);
  }

  return phpClasses;
}

export function getFromStaticCalls(text: string) {
  const regex = /([A-Z][A-Za-z0-9\-_]*)::/gm;
  let matches: any = [];
  const phpClasses: any = [];

  while ((matches = regex.exec(text))) {
    phpClasses.push(matches[1]);
  }

  return phpClasses;
}

export function getFromInstanceofOperator(text: string) {
  const regex = /instanceof ([A-Z_][A-Za-z0-9_]*)/gm;
  let matches: any = [];
  const phpClasses: any = [];

  while ((matches = regex.exec(text))) {
    phpClasses.push(matches[1]);
  }

  return phpClasses;
}

export function getFromTypeHints(text: string, builtInClasses: any) {
  const regex = /(?<!\$)([A-Z_][A-Za-z0-9_]*)[[<]/gm;

  let matches: any = [];
  const phpClasses: any = [];

  while ((matches = regex.exec(text))) {
    const txt = matches[1];

    if (!builtInClasses.includes(txt)) {
      phpClasses.push(txt);
    }
  }

  return phpClasses;
}

export function getFromReturnType(text: string, builtInClasses: any) {
  const regex = /(?<=\):( )?)([A-Z_][A-Za-z0-9_]*)/gm;

  let matches: any = [];
  const phpClasses: any = [];

  while ((matches = regex.exec(text))) {
    const txt = matches[1];

    if (!builtInClasses.includes(txt)) {
      phpClasses.push(txt);
    }
  }

  return phpClasses;
}

export function uniqueArray(arr: Array<any>) {
  let unique = arr.reduce(function (acc: any, curr: any) {
    if (!acc.includes(curr)) {
      acc.push(curr);
    }
    return acc;
  }, []);
  return unique;
}
