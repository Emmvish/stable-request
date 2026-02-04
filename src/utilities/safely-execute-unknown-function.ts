export async function safelyExecuteUnknownFunction(f: Function, ...args: any[]) {
  const result = f(...args);
  if (result instanceof Promise) {
    await result;
  }
  return result;
}
