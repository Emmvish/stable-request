import { TRIAL_MODE_OPTIONS } from '../types/index.js';

export function validateTrialModeProbabilities(trialMode: TRIAL_MODE_OPTIONS) {
  if (trialMode.enabled) {
    const reqFailureProbability = trialMode.reqFailureProbability ?? 0;
    const retryFailureProbability = trialMode.retryFailureProbability ?? 0;
    if (reqFailureProbability < 0 || reqFailureProbability > 1) {
      throw new Error(
        'stable-request: Unable to proceed as request failure probability must be between 0 and 1.'
      );
    }
    if (retryFailureProbability < 0 || retryFailureProbability > 1) {
      throw new Error(
        'stable-request: Unable to proceed as retry failure probability must be between 0 and 1.'
      );
    }
  }
}
