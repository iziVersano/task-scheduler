/** @typedef {"gcp" | "aws" | "azure"} Cloud */

/**
 * @typedef {Object} Identity
 * @property {string} id
 * @property {string} name
 * @property {Cloud} cloud
 * @property {string} role
 */

/** @typedef {Object} Permission
 * @property {string} id
 * @property {string} identityId
 * @property {string} resource
 * @property {string[]} actions
 */

/** @typedef {Object} AccessRequest
 * @property {string} identityId
 * @property {string} resource
 * @property {string} action
 */

/** @typedef {"allowed" | "denied"} AccessResult */

export const CLOUDS = ['gcp', 'aws', 'azure'];

export const CLOUD_META = {
  gcp: {
    label: 'GCP',
    identityLabel: 'Service Account',
    color: '#4285f4',
    icon: '☁',
    defaultRoles: [
      'roles/viewer',
      'roles/editor',
      'roles/owner',
      'roles/storage.objectViewer',
      'roles/compute.instanceAdmin',
      'roles/bigquery.dataEditor',
    ],
    resources: [
      'projects/my-project',
      'storage/my-bucket',
      'compute/instances',
      'bigquery/datasets',
      'pubsub/topics',
    ],
    actions: ['read', 'write', 'delete', 'list', 'create'],
  },
  aws: {
    label: 'AWS',
    identityLabel: 'IAM Role',
    color: '#ff9900',
    icon: '🔶',
    defaultRoles: [
      'AmazonS3ReadOnlyAccess',
      'AmazonEC2FullAccess',
      'AdministratorAccess',
      'AmazonDynamoDBReadOnlyAccess',
      'AWSLambdaBasicExecutionRole',
      'AmazonRDSFullAccess',
    ],
    resources: [
      'arn:aws:s3:::my-bucket',
      'arn:aws:ec2:us-east-1:*:instance/*',
      'arn:aws:dynamodb:us-east-1:*:table/*',
      'arn:aws:lambda:us-east-1:*:function:*',
      'arn:aws:rds:us-east-1:*:db:*',
    ],
    actions: ['s3:GetObject', 's3:PutObject', 'ec2:StartInstances', 'ec2:StopInstances', 'dynamodb:GetItem', 'lambda:InvokeFunction'],
  },
  azure: {
    label: 'Azure',
    identityLabel: 'Service Principal',
    color: '#0078d4',
    icon: '🔷',
    defaultRoles: [
      'Reader',
      'Contributor',
      'Owner',
      'Storage Blob Data Reader',
      'Virtual Machine Contributor',
      'SQL DB Contributor',
    ],
    resources: [
      '/subscriptions/sub-1/resourceGroups/rg-1',
      '/subscriptions/sub-1/storageAccounts/sa1',
      '/subscriptions/sub-1/virtualMachines/vm1',
      '/subscriptions/sub-1/sqlServers/sql1',
      '/subscriptions/sub-1/webApps/app1',
    ],
    actions: ['read', 'write', 'delete', 'action', 'assign'],
  },
};
