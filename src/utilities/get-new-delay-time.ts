import { RETRY_STRATEGIES } from "../enums/index.js";

export function getNewDelayTime(
  retryStrategy = RETRY_STRATEGIES.FIXED,
  delay = 1000,
  currentAttempt = 1,
  jitter = 0
) {
  let calculatedDelay: number;
  
  switch (retryStrategy) {
    case RETRY_STRATEGIES.FIXED:
      calculatedDelay = delay;
      break;
    case RETRY_STRATEGIES.LINEAR:
      calculatedDelay = currentAttempt * delay;
      break;
    case RETRY_STRATEGIES.EXPONENTIAL:
      calculatedDelay = (
        delay *
        Math.pow(2, currentAttempt > 0 ? currentAttempt - 1 : currentAttempt)
      );
      break;
    default:
      calculatedDelay = delay;
  }
  
  if (jitter !== 0) {
    const minFactor = 1 - jitter;
    const maxFactor = 1 + jitter;
    const randomFactor = minFactor + Math.random() * (maxFactor - minFactor);
    calculatedDelay = Math.round(calculatedDelay * randomFactor);
  }
  
  return calculatedDelay;
}
