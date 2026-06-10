import { CLOUD_META } from './types.js';

let nextId = 1;

/** Create a new identity for a given cloud */
export function createIdentity(cloud, name, role) {
  return {
    id: `id-${nextId++}`,
    name,
    cloud,
    role,
  };
}

/** Create a permission binding */
export function createPermission(identityId, resource, actions) {
  return {
    id: `perm-${nextId++}`,
    identityId,
    resource,
    actions: Array.isArray(actions) ? actions : [actions],
  };
}

/** Check if an identity has access to a resource+action based on permissions */
export function checkAccess(identity, permissions, resource, action, lang = 'en') {
  const label = CLOUD_META[identity.cloud].identityLabel;
  const matching = permissions.filter(
    (p) => p.identityId === identity.id && p.resource === resource
  );
  if (matching.length === 0) {
    const reason = lang === 'de'
      ? `Keine Berechtigungen gefunden für ${label} "${identity.name}" auf Ressource "${resource}"`
      : `No permissions found for ${label} "${identity.name}" on resource "${resource}"`;
    return { result: 'denied', reason };
  }

  const hasAction = matching.some((p) => p.actions.includes(action) || p.actions.includes('*'));
  if (hasAction) {
    const reason = lang === 'de'
      ? `${label} "${identity.name}" (${identity.role}) hat Zugriff auf "${action}" auf "${resource}"`
      : `${label} "${identity.name}" (${identity.role}) is granted "${action}" on "${resource}"`;
    return { result: 'allowed', reason };
  }

  const allowed = matching.flatMap((p) => p.actions).join(', ');
  const reason = lang === 'de'
    ? `${label} "${identity.name}" hat Berechtigungen auf "${resource}", aber nicht für Aktion "${action}". Erlaubte Aktionen: ${allowed}`
    : `${label} "${identity.name}" has permissions on "${resource}" but not for action "${action}". Allowed actions: ${allowed}`;
  return { result: 'denied', reason };
}

/** Generate a starter set of identities and permissions for demo purposes */
export function generateDemoData() {
  const identities = [];
  const permissions = [];

  // GCP Service Account
  const gcpSa = createIdentity('gcp', 'data-pipeline-sa@my-project.iam', 'roles/storage.objectViewer');
  identities.push(gcpSa);
  permissions.push(createPermission(gcpSa.id, 'storage/my-bucket', ['read', 'list']));
  permissions.push(createPermission(gcpSa.id, 'bigquery/datasets', ['read']));

  // AWS IAM Role
  const awsRole = createIdentity('aws', 'LambdaExecutionRole', 'AmazonS3ReadOnlyAccess');
  identities.push(awsRole);
  permissions.push(createPermission(awsRole.id, 'arn:aws:s3:::my-bucket', ['s3:GetObject']));
  permissions.push(createPermission(awsRole.id, 'arn:aws:lambda:us-east-1:*:function:*', ['lambda:InvokeFunction']));

  // Azure Service Principal
  const azureSp = createIdentity('azure', 'deploy-sp-prod', 'Contributor');
  identities.push(azureSp);
  permissions.push(createPermission(azureSp.id, '/subscriptions/sub-1/resourceGroups/rg-1', ['read', 'write']));
  permissions.push(createPermission(azureSp.id, '/subscriptions/sub-1/webApps/app1', ['read', 'write', 'action']));

  return { identities, permissions };
}

/** Map a cloud provider to its equivalent identity concepts */
export function getCloudEquivalents() {
  return [
    {
      concept: 'Machine Identity',
      gcp: 'Service Account',
      aws: 'IAM Role',
      azure: 'Service Principal',
    },
    {
      concept: 'Permission Binding',
      gcp: 'IAM Policy Binding',
      aws: 'IAM Policy Attachment',
      azure: 'Role Assignment',
    },
    {
      concept: 'Permission Set',
      gcp: 'IAM Role (roles/*)',
      aws: 'IAM Policy (JSON)',
      azure: 'Role Definition',
    },
    {
      concept: 'Scope',
      gcp: 'Project / Folder / Org',
      aws: 'Account / OU',
      azure: 'Subscription / Resource Group',
    },
    {
      concept: 'Temporary Credentials',
      gcp: 'Workload Identity Federation',
      aws: 'STS AssumeRole',
      azure: 'Managed Identity',
    },
    {
      concept: 'Audit Log',
      gcp: 'Cloud Audit Logs',
      aws: 'CloudTrail',
      azure: 'Activity Log',
    },
  ];
}
