export function safelyStringify(data: { [key: string]: any }, maxLength = 1000): string {
  try {
    const str = JSON.stringify(data);
    if (maxLength < 0) {
      maxLength = 1000;
    }
    return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
  } catch {
    return '[Unserializable data]';
  }
}
