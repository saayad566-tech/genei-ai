/**
 * Shared ComfyUI workflow shape.
 *
 * Kept in its own module so the adapter, the workflow injector and the proof scene can
 * all reference it without importing each other.
 *
 * A workflow is the API-format graph ComfyUI accepts at POST /prompt:
 *   { "<nodeId>": { "class_type": "KSampler", "inputs": { ... } } }
 */
export type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

export type Workflow = Record<string, WorkflowNode>;
