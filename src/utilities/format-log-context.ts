import { ExecutionContext } from '../types/index.js';

export function formatLogContext(context?: ExecutionContext): string {
  if (!context) return '';
  
  const parts: string[] = [];
  
  if (context.workflowId) {
    parts.push(`Workflow: ${context.workflowId}`);
  }
  
  if (context.branchId) {
    parts.push(`Branch: ${context.branchId}`);
  }
  
  if (context.phaseId) {
    parts.push(`Phase: ${context.phaseId}`);
  }
  
  if (context.requestId) {
    parts.push(`Request: ${context.requestId}`);
  }
  
  return parts.length > 0 ? `[${parts.join('] [')}] ` : '';
}
