import {
  IntegrationInstance,
  RelationshipDirection,
} from "@jupiterone/jupiter-managed-integration-sdk";
import {
  VERACODE_ACCOUNT_ENTITY_TYPE,
  VERACODE_ACCOUNT_SERVICE_RELATIONSHIP_TYPE,
  VERACODE_CWE_ENTITY_TYPE,
  VERACODE_FINDING_ENTITY_TYPE,
  VERACODE_SERVICE_ENTITY_TYPE,
  VERACODE_SERVICE_VULNERABILITY_RELATIONSHIP_TYPE,
  VERACODE_VULNERABILITY_CWE_RELATIONSHIP_TYPE,
  VERACODE_VULNERABILITY_ENTITY_TYPE,
  VERACODE_VULNERABILITY_FINDING_RELATIONSHIP_TYPE,
} from "./constants";
import {
  AccountEntity,
  AccountServiceRelationship,
  CWEEntity,
  FindingEntity,
  ServiceEntity,
  ServiceVulnerabilityRelationship,
  VulnerabilityCWERelationship,
  VulnerabilityEntity,
  VulnerabilityFindingRelationship,
} from "./types";
import getTime from "./utils/getTime";

interface CWEReference {
  name: string;
  url: string;
}

interface CWEData {
  id: string;
  name: string;
  description: string;
  references: CWEReference[];
  recommendation: string;
  remediation_effort: number;
  severity: number;
}

interface FindingSource {
  module: string;
  file_name: string;
  file_line_number: string;
  file_path: string;
}

interface FindingStatus {
  status: string;
  reopened: boolean;
  resolution: string;
  resolution_status: string;
  found_date: string;
  resolved_date?: string;
  reopened_date?: string;
  modified_date: string;
  finding_source: FindingSource;
}

interface FindingCategory {
  id: string;
  name: string;
  description: string;
}

export interface FindingData {
  cvss?: number;
  cwe: CWEData;
  description?: string;
  exploitability: number;
  finding_status: { [applicationId: string]: FindingStatus };
  finding_category: FindingCategory;
  guid: string;
  severity: number;
  scan_type: string;
}

interface ApplicationProfile {
  name: string;
}

export interface ApplicationData {
  guid: string;
  profile: ApplicationProfile;
}

export function toAccountEntity(instance: IntegrationInstance): AccountEntity {
  return {
    _class: "Account",
    _key: instance.id,
    _type: VERACODE_ACCOUNT_ENTITY_TYPE,
    displayName: instance.name,
    name: instance.name,
  };
}

export function toServiceEntity(finding: FindingData): ServiceEntity {
  return {
    _class: "Service",
    _key: `veracode-scan-${finding.scan_type.toLowerCase()}`,
    _type: VERACODE_SERVICE_ENTITY_TYPE,
    category: "software",
    displayName: finding.scan_type,
    name: finding.scan_type,
  };
}

export function toCWEEntity(finding: FindingData): CWEEntity {
  return {
    _class: "Weakness",
    _key: `cwe-${finding.cwe.id}`,
    _type: VERACODE_CWE_ENTITY_TYPE,
    description: finding.cwe.description,
    displayName: finding.cwe.name,
    id: finding.cwe.id,
    name: finding.cwe.name,
    recommendation: finding.cwe.recommendation,
    references: finding.cwe.references.map(r => r.url),
    remediationEffort: finding.cwe.remediation_effort,
    severity: finding.cwe.severity,
  };
}

export function toVulnerabilityEntity(
  finding: FindingData,
): VulnerabilityEntity {
  return {
    _class: "Vulnerability",
    _key: `veracode-vulnerability-${finding.finding_category.id}`,
    _type: VERACODE_VULNERABILITY_ENTITY_TYPE,
    category: "application",
    cvss: finding.cvss,
    cwe: finding.cwe.id,
    description: finding.description,
    displayName: finding.finding_category.name,
    exploitability: finding.exploitability,
    id: finding.finding_category.id,
    name: finding.finding_category.name,
    public: false,
    scanType: finding.scan_type,
    severity: finding.severity,
  };
}

export function toFindingEntity(
  finding: FindingData,
  application: ApplicationData,
): FindingEntity {
  const findingStatus = finding.finding_status[application.guid];

  return {
    _class: "Finding",
    _key: `veracode-finding-${finding.guid}`,
    _type: VERACODE_FINDING_ENTITY_TYPE,

    targets: application.profile.name,

    displayName: finding.finding_category.name,
    name: finding.finding_category.name,

    open: findingStatus.status === "OPEN",
    reopened: findingStatus.reopened,
    resolution: findingStatus.resolution,
    resolutionStatus: findingStatus.resolution_status,

    foundDate: getTime(findingStatus.found_date)!,
    modifiedDate: getTime(findingStatus.modified_date)!,
    reopenedDate: getTime(findingStatus.reopened_date),
    resolvedDate: getTime(findingStatus.resolved_date),

    sourceFileLineNumber: findingStatus.finding_source.file_line_number,
    sourceFileName: findingStatus.finding_source.file_name,
    sourceFilePath: findingStatus.finding_source.file_path,
    sourceModule: findingStatus.finding_source.module,
  };
}

export function toAccountServiceRelationship(
  accountEntity: AccountEntity,
  serviceEntity: ServiceEntity,
): AccountServiceRelationship {
  return {
    _class: "HAS",
    _key: `${accountEntity._key}|has|${serviceEntity._key}`,
    _type: VERACODE_ACCOUNT_SERVICE_RELATIONSHIP_TYPE,

    _fromEntityKey: accountEntity._key,
    _toEntityKey: serviceEntity._key,
  };
}

export function toServiceVulnerabilityRelationship(
  serviceEntity: ServiceEntity,
  vulnerabilityEntity: VulnerabilityEntity,
): ServiceVulnerabilityRelationship {
  return {
    _class: "IDENTIFIED",
    _key: `${serviceEntity._key}|identified|${vulnerabilityEntity._key}`,
    _type: VERACODE_SERVICE_VULNERABILITY_RELATIONSHIP_TYPE,

    _fromEntityKey: serviceEntity._key,
    _toEntityKey: vulnerabilityEntity._key,
  };
}

export function toVulnerabilityCWERelationship(
  vulnerabilityEntity: VulnerabilityEntity,
  cweEntity: CWEEntity,
): VulnerabilityCWERelationship {
  return {
    _class: "EXPLOITS",
    _key: `${vulnerabilityEntity._key}|exploits|${cweEntity._key}`,
    _type: VERACODE_VULNERABILITY_CWE_RELATIONSHIP_TYPE,

    _fromEntityKey: vulnerabilityEntity._key,
    _toEntityKey: cweEntity._key as string,

    _mapping: {
      relationshipDirection: RelationshipDirection.FORWARD,
      sourceEntityKey: vulnerabilityEntity._key,
      targetEntity: cweEntity,
      targetFilterKeys: ["_key"],
    },

    displayName: "EXPLOITS",
  };
}

export function toVulnerabilityFindingRelationship(
  vulnerabilityEntity: VulnerabilityEntity,
  findingEntity: FindingEntity,
): VulnerabilityFindingRelationship {
  return {
    _class: "IS",
    _key: `${findingEntity._key}|is|${vulnerabilityEntity._key}`,
    _type: VERACODE_VULNERABILITY_FINDING_RELATIONSHIP_TYPE,

    _fromEntityKey: findingEntity._key,
    _toEntityKey: vulnerabilityEntity._key,
  };
}
