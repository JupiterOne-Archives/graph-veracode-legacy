import {
  CreateMappedRelationshipOperation,
  EntityFromIntegration,
  EntityOperation,
  IntegrationExecutionContext,
  IntegrationInvocationEvent,
  PersisterOperations,
  RelationshipDirection,
  RelationshipFromIntegration,
  RelationshipOperation,
  RelationshipOperationType,
} from "@jupiterone/jupiter-managed-integration-sdk";
import {
  toAccountServiceRelationship,
  toServiceEntity,
  toServiceVulnerabilityRelationship,
} from "./converters";
import {
  AccountEntity,
  AccountServiceRelationship,
  CWEEntityMap,
  FindingEntity,
  ServiceEntity,
  ServiceVulnerabilityRelationship,
} from "./types";

type Context = IntegrationExecutionContext<IntegrationInvocationEvent>;

export async function processFindings(
  context: Context,
  accountEntity: AccountEntity,
  findingEntities: FindingEntity[],
  cweMap: CWEEntityMap,
): Promise<PersisterOperations> {
  const serviceEntitiesTypeMap: any = {};
  const accountServiceRelationships: AccountServiceRelationship[] = [];
  const serviceVulnerabilityRelationships = new Array<
    ServiceVulnerabilityRelationship
  >();
  const mappedRelationshipOperations: CreateMappedRelationshipOperation[] = [];

  for (const finding of findingEntities) {
    const scanType = finding.scanType.toLowerCase();
    let service = serviceEntitiesTypeMap[scanType];

    if (!service) {
      const serviceEntity = toServiceEntity(scanType);
      serviceEntitiesTypeMap[scanType] = serviceEntity;
      service = serviceEntity;
      accountServiceRelationships.push(
        toAccountServiceRelationship(accountEntity, serviceEntity),
      );
    }

    serviceVulnerabilityRelationships.push(
      toServiceVulnerabilityRelationship(service, finding),
    );

    const cwe = cweMap[finding.cwe];

    mappedRelationshipOperations.push({
      relationshipClass: "EXPLOITS",
      relationshipDirection: RelationshipDirection.FORWARD,
      relationshipKey: `${finding._key}|exploits|${cwe._key}`,
      relationshipType: `veracode_finding_exploits_cwe`,
      sourceEntityKey: finding._key,
      targetEntity: cwe,
      targetFilterKeys: [["id", cwe.id]],
      timestamp: context.event.timestamp,
      type: RelationshipOperationType.CREATE_MAPPED_RELATIONSHIP,
    });
  }

  const findingEntityOperations = await toEntityOperations(
    context,
    findingEntities,
    "veracode_finding",
  );

  const serviceEntityOperations = await toEntityOperations(
    context,
    Object.values(serviceEntitiesTypeMap) as ServiceEntity[],
    "veracode_scan",
  );

  const serviceRelationships = [
    ...(await toRelationshipOperations(
      context,
      accountServiceRelationships,
      "veracode_account_has_service",
    )),
    ...(await toRelationshipOperations(
      context,
      serviceVulnerabilityRelationships,
      "veracode_scan_identified_finding",
    )),
  ];

  return [
    [...findingEntityOperations, ...serviceEntityOperations],
    [...mappedRelationshipOperations, ...serviceRelationships],
  ];
}

export async function processAccount(
  context: Context,
  accountEntity: AccountEntity,
): Promise<PersisterOperations> {
  return [
    await toEntityOperations(context, [accountEntity], "veracode_account"),
    [],
  ];
}

async function toEntityOperations<T extends EntityFromIntegration>(
  context: Context,
  entities: T[],
  type: string,
): Promise<EntityOperation[]> {
  const { graph, persister } = context.clients.getClients();

  const oldEntities = await graph.findEntities({
    _accountId: context.instance.accountId,
    _deleted: false,
    _integrationInstanceId: context.instance.id,
    _type: type,
  });

  return persister.processEntities(oldEntities, entities);
}

async function toRelationshipOperations<T extends RelationshipFromIntegration>(
  context: Context,
  relationships: T[],
  type: string,
): Promise<RelationshipOperation[]> {
  const { graph, persister } = context.clients.getClients();

  const oldRelationships = await graph.findRelationships({
    _accountId: context.instance.accountId,
    _deleted: false,
    _integrationInstanceId: context.instance.id,
    _type: type,
  });

  return persister.processRelationships(oldRelationships, relationships);
}
