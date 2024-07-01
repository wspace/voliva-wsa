import lib_io from "./lib/io.wsa?raw";
import lib_memory from "./lib/memory.wsa?raw";

const opcodes = {
  push,
  doub,
  swap,
  pop,
  scpy,
  slide,
  label,
  add,
  sub,
  mul,
  div,
  mod,
  store,
  storestr,
  retrive,
  call,
  jump,
  jumpz,
  jumpn,
  jumpp,
  jumpnz,
  jumppz,
  jumppn,
  jumpnp: jumppn,
  ret,
  exit,
  outn,
  outc,
  inn,
  inc,
  test,
  valuestring,
  valueinteger,
  debugger: _debugger,
};

export type LineStream = (onLine: (line: string | null) => void) => () => void;
export const stringToLineStream =
  (str: string): LineStream =>
  (onLine) => {
    let stopped = false;

    setTimeout(() => {
      const lines = str.split("\n");
      for (let i = 0; i < lines.length && !stopped; i++) {
        onLine(lines[i]);
      }
      onLine(null);
    });

    return () => {
      stopped = true;
    };
  };

const valueMap: Record<string, string | bigint> = {};
const resolveValue = (value: string | bigint) => {
  if (typeof value === "bigint") return value;
  if (value in valueMap) {
    return valueMap[value];
  }
  if (value.length === 3 && value.startsWith("'") && value.endsWith("'")) {
    return BigInt(value.charCodeAt(1));
  }
  return value;
};

const labelMap: Record<string, number> = {};
let labelIdx = 0;
function numToStr(num: bigint | number) {
  return num
    .toString(2)
    .split("")
    .map((v) => (v == "0" ? " " : "\t"))
    .join("");
}
function getTranslatedLabel(label: string) {
  if (!(label in labelMap)) {
    labelMap[label] = labelIdx++;
  }
  return numToStr(labelMap[label]) + "\n";
}

let internalLabel = 0;
function getInternalLabel() {
  return `__internal_label_` + internalLabel++;
}

function number(num: bigint) {
  const sign = num >= 0n ? " " : "\t";
  num = num < 0n ? -num : num;
  return sign + numToStr(num) + "\n";
}

function push(value: string | bigint) {
  return "  " + number(BigInt(resolveValue(value)));
}
function pop() {
  return ` \n\n`;
}
function doub() {
  return ` \n `;
}
function swap() {
  return " \n\t";
}
function scpy(value: string) {
  return " \t " + number(BigInt(resolveValue(value)));
}
function slide(value: string) {
  return " \t\n" + number(BigInt(resolveValue(value)));
}
function label(label: string) {
  return `\n  ${getTranslatedLabel(label)}`;
}

function pushIfDefined(value: string | bigint | undefined) {
  if (value !== "" && value != undefined) {
    return push(value);
  }
  return "";
}
function add(value?: string | bigint) {
  if (value && Number(value) === 0) {
    return "";
  }
  return pushIfDefined(value) + "\t   ";
}
function sub(value?: string | bigint) {
  if (value && Number(value) === 0) {
    return "";
  }
  return pushIfDefined(value) + "\t  \t";
}
function mul(value?: string | bigint) {
  if (value && Number(value) === 1) {
    return "";
  }
  return pushIfDefined(value) + "\t  \n";
}
function div(value?: string | bigint) {
  if (value && Number(value) === 1) {
    return "";
  }
  return pushIfDefined(value) + "\t \t ";
}
function mod(value?: string | bigint) {
  return pushIfDefined(value) + "\t \t\t";
}

function pushAddress(addr: string | bigint | undefined): string {
  if (
    typeof addr == "string" &&
    (addr.startsWith("+") || addr.startsWith("-"))
  ) {
    return retrive(0n) + add(BigInt(addr));
  } else {
    return pushIfDefined(addr);
  }
}

function store(value?: string | bigint) {
  let result = "";
  if (value) {
    result += pushAddress(value);
    result += swap();
  }
  return result + "\t\t ";
}
function storestr(value: string) {
  value = String(resolveValue(value));

  return (
    (value + "\0")
      .split("")
      .map((v) => doub() + push(BigInt(v.charCodeAt(0))) + store() + add(1n))
      .join("") + pop()
  );
}
function retrive(value: string | bigint) {
  return pushAddress(value) + "\t\t\t";
}
function call(label: string) {
  return `\n \t${getTranslatedLabel(label)}`;
}
function jump(label: string) {
  return `\n \n${getTranslatedLabel(label)}`;
}
function jumpz(label: string) {
  return `\n\t ${getTranslatedLabel(label)}`;
}
function jumpn(label: string) {
  return `\n\t\t${getTranslatedLabel(label)}`;
}
function jumpp(label: string) {
  return [push(0n), swap(), sub(), jumpn(label)].join("");
}
function jumpnz(jmpLabel: string) {
  const s1 = getInternalLabel();
  return [jumpp(s1), jump(jmpLabel), label(s1)].join("");
}
function jumppz(jmpLabel: string) {
  const s1 = getInternalLabel();
  return [jumpn(s1), jump(jmpLabel), label(s1)].join("");
}
function jumppn(jmpLabel: string) {
  const s1 = getInternalLabel();
  return [jumpz(s1), jump(jmpLabel), label(s1)].join("");
}

async function include(
  filename: string,
  getIncludedStream: (filename: string) => LineStream
) {
  const content = await (() => {
    if (filename === "io") {
      return compile(stringToLineStream(lib_io), getIncludedStream);
    }
    if (filename === "memory") {
      return compile(stringToLineStream(lib_memory), getIncludedStream);
    }

    return compile(getIncludedStream(filename), getIncludedStream);
  })();
  const includeLabel = getInternalLabel();

  return [jump(includeLabel), content, label(includeLabel)].join("");
}
function ret() {
  return `\n\t\n`;
}
function exit() {
  return `\n\n\n`;
}
function outn() {
  return "\t\n \t";
}
function outc() {
  return "\t\n  ";
}
function inn() {
  return "\t\n\t\t";
}
function inc() {
  return "\t\n\t ";
}
function test(value: string) {
  return [doub(), sub(value)].join("");
}
function valuestring(args: string) {
  const [name, ...rest] = args.split(" ");
  if (!name.startsWith("_")) {
    throw new Error(`${name} doesn't start with _`);
  }

  const value = rest.join(" ");
  valueMap[name] = value;
  return "";
}
function valueinteger(args: string) {
  const [name, ...rest] = args.split(" ");
  if (!name.startsWith("_")) {
    throw new Error(`${name} doesn't start with _`);
  }

  const value = BigInt(rest.join(" "));
  valueMap[name] = value;
  return "";
}

let debugExtensions = false;
export function enableDebugExtensions() {
  debugExtensions = true;
}
function _debugger() {
  return debugExtensions ? "\n\n " : "";
}

export async function compile(
  inputStream: LineStream,
  getIncludedStream: (filename: string) => LineStream
) {
  const results: (Promise<string> | string)[] = [];

  let lineNum = 0;
  let onEnd: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    onEnd = resolve;
  });

  inputStream((line) => {
    if (!line) {
      onEnd();
      return;
    }

    lineNum++;
    line = line.trim();
    if (line.startsWith(";") || line.length == 0) {
      return;
    }
    // eslint-disable-next-line prefer-const
    let [opcode, ...args] = line.split(" ");
    opcode = opcode.toLocaleLowerCase();
    const mergedArgs = args.join(" ");

    try {
      if (opcode == "include") {
        results.push(include(mergedArgs, getIncludedStream));
      } else {
        results.push(
          (opcodes as any)[opcode](mergedArgs) ??
            Promise.resolve(`{${opcode} ${mergedArgs}}`)
        );
      }
    } catch (ex) {
      console.error(ex);
      throw new Error(`failed at line ${lineNum}: "${line}"`);
    }
  });

  await ended;
  const r = await Promise.all(results);
  return r.join("");
}

export async function compileAndExit(
  inputStream: LineStream,
  getIncludedStream: (filename: string) => LineStream
) {
  return (await compile(inputStream, getIncludedStream)) + exit();
}