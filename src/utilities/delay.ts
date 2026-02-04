export async function delay(wait = 1000, maxAllowedWait = 60000) {
  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, Math.min(wait, maxAllowedWait));
  });
}
