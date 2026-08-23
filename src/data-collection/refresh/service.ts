import type { SourceEnvironment } from "../source-registry";
import type { RefreshPolicyGateway, RefreshTaskRequest } from "./contracts";
import type { RefreshEnqueueResult, RefreshQueueRepository } from "./queue";

export interface RefreshEnqueueAudit {
  readonly enqueueResult: RefreshEnqueueResult;
  readonly policyAllowedAtEnqueue: boolean;
  readonly preferredMethodAtEnqueue: string | null;
  readonly policyVersion: string;
  readonly sourceRegistryVersion: string;
  readonly reasonCodes: readonly string[];
}

/**
 * Application boundary for enqueue-time policy visibility. Execution always
 * resolves a new CollectionPlan again; this audit never authorizes a worker.
 */
export class RefreshTaskService {
  constructor(
    private readonly queue: RefreshQueueRepository,
    private readonly policy: RefreshPolicyGateway,
  ) {}

  enqueue(
    request: RefreshTaskRequest,
    context: {
      readonly environment: SourceEnvironment;
      readonly satisfiedConditions: readonly string[];
    },
  ): RefreshEnqueueAudit {
    const plan = this.policy.resolveCollectionPlan({
      sourceId: request.sourceId,
      operation: "targeted_refresh",
      environment: context.environment,
      entityType: request.entityType,
      targetField:
        request.fieldPaths.length === 1 ? request.fieldPaths[0] : null,
      targetUrls: request.targetUrls,
      requestedFields: request.fieldPaths,
      discovery: false,
      followLinks: false,
      pagination: false,
      sitemap: false,
      authentication: false,
      challengeAction: "stop",
      satisfiedConditions: context.satisfiedConditions,
      decidedAt: request.requestedAt,
    });
    const enqueueResult = this.queue.enqueue(request);
    this.queue.recordPolicyVersions(
      enqueueResult.task.refresh_task_id,
      plan.policyVersion,
      plan.registryVersion,
    );
    return {
      enqueueResult: {
        ...enqueueResult,
        task: this.queue.get(enqueueResult.task.refresh_task_id)!,
      },
      policyAllowedAtEnqueue: plan.allowed,
      preferredMethodAtEnqueue: plan.preferredMethod,
      policyVersion: plan.policyVersion,
      sourceRegistryVersion: plan.registryVersion,
      reasonCodes: plan.reasonCodes,
    };
  }
}
